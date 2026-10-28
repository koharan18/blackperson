import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('server shutdown closes idle DB connections without an unhandled client dump',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'black-shutdown-'));
  const runtime=new URL('../server/runtime.mjs',import.meta.url).href;
  const code=`import {startDatabase} from ${JSON.stringify(runtime)};const db=await startDatabase({directory:${JSON.stringify(directory)},port:15440});await db.pool.query('SELECT 1');process.once('SIGTERM',async()=>{await db.stop();process.exit(0)});console.log('READY');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code]);let stderr='';
  child.stderr.on('data',data=>{stderr+=data;});
  const closed=new Promise(resolve=>child.once('exit',code=>resolve(code)));
  try{
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('startup timeout')),10000);child.stdout.on('data',data=>{if(data.toString().includes('READY')){clearTimeout(timeout);resolve();}});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('startup failed'));});});
    child.kill('SIGTERM');await closed;
    assert.ok(!stderr.includes("Unhandled 'error' event"),'idle pool errors must not crash and dump the database client');
    assert.ok(!stderr.includes('connectionParameters'),'connection details must not be logged');
  }finally{child.kill('SIGTERM');await rm(directory,{recursive:true,force:true});}
});
