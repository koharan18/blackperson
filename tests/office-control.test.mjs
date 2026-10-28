import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {requestOfficeStop,startOfficeControl} from '../server/office-control.mjs';

test('local stop requires its secret and cleans up its own control file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'black-control-'));let stops=0,control;
  try{
    control=await startOfficeControl(directory,async()=>{stops++;});
    const metadata=JSON.parse(await readFile(control.path,'utf8'));
    const denied=await new Promise((resolve,reject)=>{
      const socket=net.createConnection(metadata.endpoint);let result='';
      socket.on('error',reject);socket.on('connect',()=>socket.write('null\n'));
      socket.on('data',data=>{result+=data;});socket.on('end',()=>resolve(JSON.parse(result)));
    });
    assert.deepEqual(denied,{ok:false});
    await assert.rejects(requestOfficeStop({...metadata,token:'incorrect'}),/거부/);
    assert.equal(stops,0);
    await requestOfficeStop(metadata);
    await new Promise(r=>setImmediate(r));assert.equal(stops,1);
    await control.close();control=null;
    await assert.rejects(readFile(join(directory,'office-control.json')),/ENOENT/);
  }finally{if(control)await control.close();await rm(directory,{recursive:true,force:true});}
});
