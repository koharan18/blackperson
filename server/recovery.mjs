import { readFileSync } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { readDump } from './archive.mjs';

const columns = {
  User: ['id','name','email','passwordHash','role','createdAt','updatedAt'],
  RestrictedPerson: ['id','name','phone','phoneMasked','programName','reason','memo','registeredAt','registeredById','deletedAt','deletedReason','createdAt','updatedAt'],
  AuditLog: ['id','userId','action','targetType','targetId','beforeData','afterData','ipAddress','createdAt'],
  _prisma_migrations: ['id','checksum','finished_at','migration_name','logs','rolled_back_at','started_at','applied_steps_count'],
  RecoveryAccountState: ['userId','disabled'],
};
const backupKey = key => {
  if (!key || key.length < 32) throw new Error('백업 암호화 키가 필요합니다.');
  return createHash('sha256').update('BLACK-BACKUP-v1:').update(key).digest();
};

export async function exportData(pool, key) {
  const client = await pool.connect();
  const tables = {};
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const table of Object.keys(columns)) {
      if(table==='RecoveryAccountState' && !(await client.query("SELECT to_regclass('public.\"RecoveryAccountState\"') present")).rows[0].present) continue;
      tables[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
    }
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', backupKey(key), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(tables), 'utf8'), cipher.final()]);
  return JSON.stringify({ format: 'BLACK-ENCRYPTED-1', createdAt: new Date().toISOString(), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') });
}

export async function restoreData(pool, input, key, validate = async () => {}) {
  let tables;
  if (Buffer.isBuffer(input) && input.subarray(0, 5).toString() === 'PGDMP') tables = readDump(input);
  else if (typeof input === 'string' || Buffer.isBuffer(input)) {
    const archive = JSON.parse(input.toString());
    if (archive.format !== 'BLACK-ENCRYPTED-1') throw new Error('지원하지 않는 백업입니다.');
    const d = createDecipheriv('aes-256-gcm', backupKey(key), Buffer.from(archive.iv, 'hex'));
    d.setAuthTag(Buffer.from(archive.tag, 'hex'));
    tables = JSON.parse(Buffer.concat([d.update(Buffer.from(archive.data, 'base64')), d.final()]).toString('utf8'));
  } else tables = input;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(823401)");
    const existing = await client.query("SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' LIMIT 1");
    if (existing.rowCount) throw new Error('복원은 비어 있는 전용 데이터베이스에서만 가능합니다. 기존 데이터를 덮어쓰지 않았습니다.');
    await client.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('CREATE TABLE "RecoveryAccountState" ("userId" text PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE, disabled boolean NOT NULL DEFAULT false)');
    for (const [table, allowed] of Object.entries(columns)) {
      if(table==='RecoveryAccountState' && !tables[table]) continue;
      if (!Array.isArray(tables[table])) throw new Error('백업에 필수 테이블이 없습니다.');
      for (const row of tables[table]) {
        const cols = Object.keys(row);
        if (!cols.length || cols.some(c => !allowed.includes(c))) throw new Error('알 수 없는 백업 필드입니다.');
        const values = cols.map(c => ['beforeData','afterData'].includes(c) && row[c] && typeof row[c] === 'object' ? JSON.stringify(row[c]) : row[c]);
        await client.query(`INSERT INTO "${table}" (${cols.map(c => '"'+c+'"').join(',')}) VALUES (${cols.map((_, i) => '$'+(i+1)).join(',')})`, values);
      }
    }
    await validate(client);
    await client.query('COMMIT');
    return Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length]));
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
