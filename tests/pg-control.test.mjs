import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import pg from 'pg';
import {startDatabase} from '../server/runtime.mjs';
import {startControlledPostgres} from '../server/pg-control.mjs';

test('native pg_ctl preserves an existing cluster through authenticated start and fast shutdown',{skip:process.platform!=='linux'},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'black-pgctl-'));let db,control,client;
 try{
  db=await startDatabase({directory,port:15444});
  const settings=db.settings;
  await db.pool.query('CREATE TABLE control_probe (id integer PRIMARY KEY)');
  await db.pool.query('INSERT INTO control_probe VALUES (7)');
  await db.stop();db=null;
  const {pg_ctl}=await import('@embedded-postgres/linux-x64');
  control=await startControlledPostgres({executable:pg_ctl,directory:join(directory,'postgres'),port:15444});
  client=new pg.Client(settings);await client.connect();
  assert.equal((await client.query('SELECT id FROM control_probe')).rows[0].id,7);
  await client.end();client=null;await control.stop();await control.stop();control=null;
  db=await startDatabase({directory,port:15444});
  assert.equal((await db.pool.query('SELECT id FROM control_probe')).rows[0].id,7);
 }finally{if(client)await client.end();if(control)await control.stop();if(db)await db.stop();await rm(directory,{recursive:true,force:true});}
});
