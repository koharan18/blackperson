import { existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { startDatabase, readConfig, root } from '../server/runtime.mjs';
import { writeLogicalBackup } from '../server/backup.mjs';

let db;
try {
  const config = readConfig();
  const keyFile=process.env.BLACK_ENV_FILE||join(root,'private','BLACK.env.backup');
  if(!existsSync(keyFile)||!config.PHONE_ENCRYPTION_KEY)throw new Error('원본 환경 키 파일이 필요합니다.');
  const outputIndex=process.argv.indexOf('--output');
  if(outputIndex>=0&&!process.argv[outputIndex+1])throw new Error('백업 저장 폴더를 지정해 주세요.');
  const outputRoot=outputIndex>=0?resolve(process.argv[outputIndex+1]):join(root,'backups');
  db = await startDatabase();
  const folder=await writeLogicalBackup({pool:db.pool,config,keyFile,outputRoot,settingsFile:join(root,'.env')});
  if(process.argv.includes('--json'))console.log(JSON.stringify({folder}));
  else{console.log('백업 완료:',folder);console.log('이 폴더와 앱 코드를 외장 드라이브에도 보관하세요. 키 파일은 비밀 정보를 포함합니다.');}
} catch(e) { console.error(e.message); process.exitCode = 1; }
finally { if (db) await db.stop(); }

// Preserve CLI failures: embedded-postgres registers a beforeExit hook with code 0.
process.exit(process.exitCode || 0);
