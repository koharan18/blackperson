import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startDatabase, readConfig, root } from '../server/runtime.mjs';
import { exportData } from '../server/recovery.mjs';

let db;
try {
  const config = readConfig();
  db = await startDatabase();
  const data = await exportData(db.pool, config.PHONE_ENCRYPTION_KEY);
  const folder = join(root, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(join(folder, 'black.black'), data, { mode: 0o600 });
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ sha256: createHash('sha256').update(data).digest('hex'), format: 'BLACK-ENCRYPTED-1' }, null, 2), { mode: 0o600 });
  copyFileSync(join(root, 'private', 'BLACK.env.backup'), join(folder, 'BLACK.env.backup'));
  console.log('백업 완료:', folder);
  console.log('앱 소스 ZIP과 이 폴더를 함께 외장 드라이브에 보관하세요. 환경 파일은 비밀 키를 포함합니다.');
} catch(e) { console.error(e.message); process.exitCode = 1; }
finally { if (db) await db.stop(); }
