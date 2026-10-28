import test from 'node:test';
import assert from 'node:assert/strict';
import {createListener} from '../server/listener.mjs';
test('LAN listening refuses plaintext and local-only HTTP remains available',()=>{
  assert.throws(()=>createListener(()=>{},{BLACK_BIND_HOST:'0.0.0.0'}),/HTTPS/);
  const server=createListener(()=>{},{BLACK_BIND_HOST:'127.0.0.1'});
  assert.equal(typeof server.listen,'function');
  server.close();
});
