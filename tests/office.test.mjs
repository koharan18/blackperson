import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import bcrypt from 'bcryptjs';
import {startDatabase} from '../server/runtime.mjs';
import {restoreData} from '../server/recovery.mjs';
import {setupOfficeAccounts,officeStaff} from '../server/office-accounts.mjs';

test('office account setup preserves records/admin roles, resets only requested staff and invalidates their sessions',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'black-office-'));
  const db=await startDatabase({directory,port:15441});
  try{
    const stamp='2026-01-01T00:00:00Z',oldHash=await bcrypt.hash('Previous-password-123!',10);
    await restoreData(db.pool,{User:[{id:'owner',name:'기존 관리자',email:'owner@example.invalid',passwordHash:oldHash,role:'ADMIN',createdAt:stamp,updatedAt:stamp},{id:'joy',name:'이전 이름',email:'joy@black.local',passwordHash:oldHash,role:'ADMIN',createdAt:stamp,updatedAt:stamp}],RestrictedPerson:[],AuditLog:[],_prisma_migrations:[]});
    await db.pool.query('CREATE TABLE "RecoverySession" (sid text PRIMARY KEY,sess json NOT NULL,expire timestamp NOT NULL)');
    await db.pool.query('INSERT INTO "RecoverySession" VALUES ($1,$2,CURRENT_TIMESTAMP+interval \'1 day\'),($3,$4,CURRENT_TIMESTAMP+interval \'1 day\')',['owner-session',JSON.stringify({userId:'owner'}),'joy-session',JSON.stringify({userId:'joy'})]);
    const password='Office-example-password-123!';
    const result=await setupOfficeAccounts(db.pool,password);
    assert.deepEqual(result,{created:4,updated:1});assert.equal(officeStaff.length,5);
    const users=(await db.pool.query('SELECT * FROM "User"')).rows;
    assert.equal(users.length,6);assert.equal(users.find(u=>u.id==='owner').passwordHash,oldHash);
    assert.equal(users.find(u=>u.id==='joy').role,'ADMIN');
    for(const staff of officeStaff){const user=users.find(u=>u.email===staff.email);assert.ok(await bcrypt.compare(password,user.passwordHash));}
    assert.equal((await db.pool.query('SELECT sid FROM "RecoverySession"')).rows[0].sid,'owner-session');
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM "AuditLog"')).rows[0].n,5);
    const again=await setupOfficeAccounts(db.pool,password);assert.deepEqual(again,{created:0,updated:5});
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM "User"')).rows[0].n,6);
    await assert.rejects(setupOfficeAccounts(db.pool,'short'),/12/);
  }finally{await db.stop();await rm(directory,{recursive:true,force:true});}
});
