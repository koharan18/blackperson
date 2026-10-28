import {readFileSync} from 'node:fs';
import {startDatabase} from '../server/runtime.mjs';
import {setupOfficeAccounts} from '../server/office-accounts.mjs';

let db;
try{
  let input;
  try{input=JSON.parse(readFileSync(0,'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('보안 입력을 읽을 수 없습니다. 설정 프로그램에서 다시 실행해 주세요.');}
  db=await startDatabase();
  const result=await setupOfficeAccounts(db.pool,input.password);
  input.password='';
  console.log('직원 계정 설정 완료:',JSON.stringify(result));
}catch(error){console.error('직원 계정 설정 실패:',error.code||((error.message||'').includes('비밀번호')|| (error.message||'').includes('보안 입력')?error.message:'입력 또는 데이터베이스 상태를 확인해 주세요.'));process.exitCode=1;}
finally{if(db)await db.stop();}

// Preserve CLI failures: embedded-postgres registers a beforeExit hook with code 0.
process.exit(process.exitCode || 0);
