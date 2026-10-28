import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import { startDatabase, readConfig, root } from '../server/runtime.mjs';
import { restoreData } from '../server/recovery.mjs';
import { decryptPhone, maskPhone } from '../server/domain.mjs';

const path = resolve(process.argv[2] || join(root, 'private', 'black-2026-09-16T06-32-52-168Z.dump'));
let db;
try {
  const config = readConfig();
  if (!config.PHONE_ENCRYPTION_KEY || !config.SESSION_SECRET) throw new Error('private/BLACK.env.backup 파일이 필요합니다.');
  const data = readFileSync(path);
  const manifestPath = join(resolve(path, '..'), 'backup-manifest.json');
  let manifest;
  if (path.endsWith('.dump')) {
    if (!existsSync(manifestPath)) throw new Error('덤프와 같은 폴더에 backup-manifest.json이 필요합니다.');
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    if (manifest.dumpFile !== basename(path) || createHash('sha256').update(data).digest('hex') !== manifest.sha256) throw new Error('백업 이름 또는 SHA256 검증에 실패했습니다.');
  }
  db = await startDatabase();
  const counts = await restoreData(db.pool, data, config.PHONE_ENCRYPTION_KEY, async client => {
    const people = (await client.query('SELECT phone, "phoneMasked" FROM "RestrictedPerson"')).rows;
    for (const p of people) {
      const phone = decryptPhone(p.phone, config.PHONE_ENCRYPTION_KEY);
      if (p.phoneMasked.replace(/\D/g, '').slice(-4) !== phone.slice(-4)) throw new Error('복호화 전화번호 검증에 실패했습니다.');
    }
    if (manifest) {
      const names = { users: 'User', restrictedPeople: 'RestrictedPerson', auditLogs: 'AuditLog' };
      for (const [name, table] of Object.entries(names)) {
        const n = (await client.query(`SELECT count(*)::int n FROM "${table}"`)).rows[0].n;
        if (n !== manifest.sourceCounts[name]) throw new Error('백업 건수 검증에 실패했습니다.');
      }
    }
  });
  console.log('복원·전화번호 복호화·참조 무결성 검증 완료:', counts);
} catch(e) { console.error(e.message); process.exitCode = 1; }
finally { if (db) await db.stop(); }

// Preserve CLI failures: embedded-postgres registers a beforeExit hook with code 0.
process.exit(process.exitCode || 0);
