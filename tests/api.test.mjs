import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { startDatabase } from '../server/runtime.mjs';
import { restoreData } from '../server/recovery.mjs';
import { createApp } from '../server/app.mjs';

let db, server, dir, base;
const config = { SESSION_SECRET: randomBytes(32).toString('hex'), PHONE_ENCRYPTION_KEY: randomBytes(32).toString('hex') };
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'black-api-'));
  db = await startDatabase({ directory: dir, port: 15437 });
  const now = new Date().toISOString();
  const hash = await bcrypt.hash('Test-password-123!', 10);
  await restoreData(db.pool, { User: [
    { id:'admin', name:'관리자', email:'admin@example.invalid', passwordHash:hash, role:'ADMIN', createdAt:now, updatedAt:now },
    { id:'staff', name:'직원', email:'staff@example.invalid', passwordHash:hash, role:'USER', createdAt:now, updatedAt:now },
  ], RestrictedPerson:[], AuditLog:[], _prisma_migrations:[] });
  const app = await createApp({ pool:db.pool, config });
  server = app.listen(0, '127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async()=> { if(server) await new Promise(r=>server.close(r)); if(db) await db.stop(); if(dir) await rm(dir,{recursive:true,force:true}); });

function agent() {
  let cookie='', csrf='';
  return { async call(path, method='GET', body, extra={}) {
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,Origin:base,...extra},body:body?JSON.stringify(body):undefined});
    const next=response.headers.get('set-cookie'); if(next) cookie=next.split(';')[0];
    const data=await response.json(); if(data.csrfToken) csrf=data.csrfToken;
    return {status:response.status,data};
  }, async login(email='admin@example.invalid') {await this.call('/session');return this.call('/login','POST',{email,password:'Test-password-123!'});} };
}
const row={name:'홍길동',phone:'01012345678',programName:'테스트 사업',reason:'확인된 사유',memo:'내부 메모',registeredAt:'2026-10-28'};

test('authentication, CSRF, CRUD, comparison, privilege and audit work together', async()=>{
  const anon=agent();
  assert.equal((await anon.call('/people')).status,401);
  assert.equal((await anon.call('/login','POST',{email:'admin@example.invalid',password:'Test-password-123!'})).status,403);
  const admin=agent(); assert.equal((await admin.login()).status,200);
  const dashboard=await admin.call('/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.total,0);
  assert.equal((await admin.call('/people','POST',row,{'X-CSRF-Token':'wrong'})).status,403);
  const create=await admin.call('/people','POST',row); assert.equal(create.status,201);
  const id=create.data.id;
  let list=(await admin.call('/people')).data;
  assert.equal(list.total,1); assert.equal(list.rows[0].phone,undefined); assert.equal(list.rows[0].phoneMasked,'010-****-5678');
  assert.equal((await admin.call('/people?q=12345678')).data.total,1);
  assert.equal((await admin.call('/people','POST',row)).status,409);
  const compare=await admin.call('/compare','POST',{rows:[{name:row.name,phone:row.phone},{name:row.name,phone:'01011112222'},{name:'다른사람',phone:'01055556666'}]});
  assert.deepEqual(compare.data.rows.map(x=>x.status),['일치','확인 필요','미등록']);
  assert.equal((await admin.call('/people')).data.total,1,'comparison does not register applicants');
  const detail=(await admin.call('/people/'+id)).data;
  assert.equal(detail.phone,row.phone);
  assert.equal((await admin.call('/people/'+id,'PUT',{...row,reason:'수정 사유',updatedAt:detail.updatedAt})).status,200);
  assert.equal((await admin.call('/people/'+id,'PUT',{...row,updatedAt:detail.updatedAt})).status,409);
  const staff=agent(); await staff.login('staff@example.invalid');
  assert.equal((await staff.call('/users')).status,403);
  assert.equal((await staff.call('/audit')).status,403);
  assert.equal((await staff.call('/people/'+id,'DELETE',{reason:'삭제'})).status,403);
  const before=(await admin.call('/people')).data.total;
  assert.equal((await admin.call('/bulk','POST',{rows:[{...row,name:'새대상',phone:'01022223333'},row]})).status,409);
  assert.equal((await admin.call('/people')).data.total,before,'bulk must roll back first insert when second duplicates');
  assert.equal((await admin.call('/people/'+id,'DELETE',{reason:'검증 종료'})).status,200);
  assert.equal((await admin.call('/compare','POST',{rows:[{name:row.name,phone:row.phone}]})).data.rows[0].status,'미등록');
  const batch=await admin.call('/bulk','POST',{rows:[{...row,name:'일괄가',phone:'01022224444'},{...row,name:'일괄나',phone:'01033335555'}]});
  assert.equal(batch.status,201);assert.equal(batch.data.count,2);
  assert.equal((await admin.call('/dashboard')).data.total,2);
  assert.ok((await admin.call('/audit')).data.rows.some(x=>x.action==='DELETE'));
  assert.equal((await admin.call('/logout','POST',{})).status,200);
  assert.equal((await admin.call('/people')).status,401);
});

test('disabled users lose active sessions and last admin cannot disable self', async()=>{
  const admin=agent(),staff=agent(); await admin.login(); await staff.login('staff@example.invalid');
  assert.equal((await admin.call('/users/admin','PUT',{name:'관리자',role:'USER',disabled:false})).status,400);
  assert.equal((await admin.call('/users/staff','PUT',{name:'직원',role:'USER',disabled:true})).status,200);
  assert.equal((await staff.call('/people')).status,401);
});

test('startup removes expired sessions but preserves unexpired sessions',async()=>{
  await db.pool.query('INSERT INTO "RecoverySession" (sid,sess,expire) VALUES ($1,$2,CURRENT_TIMESTAMP-interval \'1 day\'),($3,$2,CURRENT_TIMESTAMP+interval \'1 day\')',['expired-fixture','{}','live-fixture']);
  await createApp({pool:db.pool,config});
  assert.equal((await db.pool.query('SELECT 1 FROM "RecoverySession" WHERE sid=$1',['expired-fixture'])).rowCount,0);
  assert.equal((await db.pool.query('SELECT 1 FROM "RecoverySession" WHERE sid=$1',['live-fixture'])).rowCount,1);
});
