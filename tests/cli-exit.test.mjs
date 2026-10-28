import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('failed backup and account commands return failure even with embedded runtime exit hooks',()=>{
 const backup=spawnSync(process.execPath,['scripts/backup.mjs','--json'],{env:{...process.env,BLACK_ENV_FILE:'/nonexistent/black-cli-env'},encoding:'utf8'});
 assert.equal(backup.status,1,backup.stderr);
 assert.equal(backup.stdout.trim(),'');
 const accounts=spawnSync(process.execPath,['scripts/setup-office-accounts.mjs'],{input:'invalid-json',encoding:'utf8'});
 assert.equal(accounts.status,1,accounts.stderr);
 assert.ok(!accounts.stdout.includes('완료'));
});

test('server startup failure returns nonzero for scheduler restart',()=>{
 const child=spawnSync(process.execPath,['server/index.mjs'],{env:{...process.env,BLACK_ENV_FILE:new URL('../server/',import.meta.url).pathname},encoding:'utf8'});
 assert.equal(child.status,1,child.stderr);
});
