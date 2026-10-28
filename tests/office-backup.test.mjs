import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {startDatabase} from '../server/runtime.mjs';
import {restoreData} from '../server/recovery.mjs';
import {writeLogicalBackup} from '../server/backup.mjs';

test('office logical backup checks key binding and produces a restorable consistent archive',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'black-backup-')),key=randomBytes(32).toString('hex');
  const db=await startDatabase({directory:join(directory,'db'),port:15442});
  try{
    const now='2026-01-01T00:00:00Z';
    await restoreData(db.pool,{User:[{id:'admin',name:'가상관리자',email:'backup@example.invalid',passwordHash:'synthetic-hash',role:'ADMIN',createdAt:now,updatedAt:now}],RestrictedPerson:[],AuditLog:[],_prisma_migrations:[]});
    const keyFile=join(directory,'BLACK.env.backup');await writeFile(keyFile,'PHONE_ENCRYPTION_KEY='+key+'\nSESSION_SECRET=synthetic-backup-session-secret');
    const outputRoot=join(directory,'daily');
    await assert.rejects(writeLogicalBackup({pool:db.pool,config:{PHONE_ENCRYPTION_KEY:randomBytes(32).toString('hex')},keyFile,outputRoot}),/키/);
    const folder=await writeLogicalBackup({pool:db.pool,config:{PHONE_ENCRYPTION_KEY:key},keyFile,outputRoot});
    const archive=await readFile(join(folder,'black.black'),'utf8');assert.ok(!archive.includes('backup@example.invalid'));
    assert.equal(await readFile(join(folder,'BLACK.env.backup'),'utf8'),await readFile(keyFile,'utf8'));
    await db.pool.query('DROP SCHEMA public CASCADE;CREATE SCHEMA public');
    await restoreData(db.pool,archive,key);assert.equal((await db.pool.query('SELECT count(*)::int n FROM "User"')).rows[0].n,1);
  }finally{await db.stop();await rm(directory,{recursive:true,force:true});}
});
