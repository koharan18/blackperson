import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Windows installer grants database access before the safety backup starts',()=>{
 const source=readFileSync(new URL('../windows/setup-office.ps1',import.meta.url),'utf8');
 const backup=source.indexOf("Write-Host '기존 명단과 계정의 안전 백업을 먼저 만듭니다.'");
 const grant=source.indexOf("Set-BlackPrivateAcl (Join-Path $AppPath 'data')");
 assert.ok(grant>=0 && grant<backup,'existing DB credentials and cluster must be accessible before first backup');
});


test('all installer database operations use the limited worker',()=>{
 const setup=readFileSync(new URL('../windows/setup-office.ps1',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../windows/office-worker.ps1',import.meta.url),'utf8');
 const common=readFileSync(new URL('../windows/office-common.ps1',import.meta.url),'utf8');
 assert.ok(setup.includes("Invoke-BlackLimitedJob $AppPath @{job='backup'"));
 assert.ok(setup.includes("Invoke-BlackLimitedJob $AppPath @{job='accounts'"));
 assert.ok(setup.includes("Invoke-BlackLimitedJob $AppPath @{job='office-backup'"));
 assert.ok(!setup.includes("& $blackNode (Join-Path $AppPath 'scripts\\backup.mjs')"));
 assert.ok(!setup.includes("& $blackNode (Join-Path $AppPath 'scripts\\setup-office-accounts.mjs')"));
 assert.ok(worker.indexOf('if (Test-BlackAdministrator)')<worker.indexOf('$process.Start()'));
 assert.ok(common.includes('-LogonType S4U -RunLevel Limited'));
 assert.ok(worker.includes('ReadToEndAsync()'));
 assert.ok(!common.includes('Stop-ScheduledTask'));
});
