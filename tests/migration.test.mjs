import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,symlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {encryptPhone} from '../server/domain.mjs';
const run=promisify(execFile),project=resolve(fileURLToPath(new URL('..',import.meta.url)));

test('stopped app copy preserves canonical records and keys; changed rows and wrong keys are detected',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'black-move-')),source=join(folder,'source'),destination=join(folder,'destination');let db;
 const key=randomBytes(32).toString('base64');
 async function snapshot(root,port){const {stdout}=await run(process.execPath,[join(project,'scripts/migration-snapshot.mjs'),root,String(port)],{env:{...process.env,BLACK_ENV_FILE:join(root,'private/BLACK.env.backup')}});return JSON.parse(stdout);}
 try{
  await mkdir(join(source,'private'),{recursive:true});await cp(join(project,'server'),join(source,'server'),{recursive:true});
  await symlink(join(project,'node_modules'),join(source,'node_modules'),'junction');
  await writeFile(join(source,'private/BLACK.env.backup'),'PHONE_ENCRYPTION_KEY='+key+'\n');
  const runtime=await import(pathToFileURL(join(source,'server/runtime.mjs')));
  db=await runtime.startDatabase({directory:join(source,'data'),port:15445});
  await db.pool.query('CREATE TABLE "RestrictedPerson" (id text PRIMARY KEY, name text, phone text, metadata jsonb)');
  await db.pool.query('INSERT INTO "RestrictedPerson" VALUES ($1,$2,$3,$4)', ['synthetic-1','합성 테스트',encryptPhone('01012345678',key),{z:[2,1],a:{nested:true}}]);
  await db.pool.query('CREATE TABLE "RecoverySession" (id text)');
  await db.stop();db=null;
  const before=await snapshot(source,15445);assert.equal(before.tables.RestrictedPerson.count,1);assert.ok(!before.tables.RecoverySession);
  await cp(source,destination,{recursive:true,verbatimSymlinks:true});
  const after=await snapshot(destination,15446);assert.equal(after.sha256,before.sha256);
  const destinationRuntime=await import(pathToFileURL(join(destination,'server/runtime.mjs')));
  db=await destinationRuntime.startDatabase({directory:join(destination,'data'),port:15446});
  await db.pool.query('UPDATE "RestrictedPerson" SET name=$1',['합성 변경']);await db.stop();db=null;
  assert.notEqual((await snapshot(destination,15446)).sha256,before.sha256);
  await writeFile(join(destination,'private/BLACK.env.backup'),'PHONE_ENCRYPTION_KEY='+randomBytes(32).toString('base64')+'\n');
  await assert.rejects(snapshot(destination,15446),error=>error.code===1&&!error.stderr.includes('01012345678'));
 }finally{if(db)await db.stop();await rm(folder,{recursive:true,force:true});}
});
