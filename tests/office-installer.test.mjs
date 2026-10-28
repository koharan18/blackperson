import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Windows installer grants database access before the safety backup starts',()=>{
 const source=readFileSync(new URL('../windows/setup-office.ps1',import.meta.url),'utf8');
 const backup=source.indexOf("Write-Host '기존 명단과 계정의 안전 백업을 먼저 만듭니다.'");
 const grant=source.indexOf("Set-BlackPrivateAcl (Join-Path $AppPath 'data')");
 assert.ok(grant>=0 && grant<backup,'existing DB credentials and cluster must be accessible before first backup');
});
