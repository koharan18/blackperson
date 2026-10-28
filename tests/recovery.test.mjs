import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startDatabase } from '../server/runtime.mjs';
import { restoreData, exportData } from '../server/recovery.mjs';

test('restore roundtrips records and rejects overwriting an existing database', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'black-recovery-'));
  const db = await startDatabase({ directory: dir, port: 15436 });
  const tables = { User: [{ id: 'u', name: '테스트', email: 'test@example.invalid', passwordHash: 'hash', role: 'ADMIN', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }], RestrictedPerson: [], AuditLog: [], _prisma_migrations: [] };
  try {
    await restoreData(db.pool, tables);
    assert.equal((await db.pool.query('SELECT count(*)::int n FROM "User"')).rows[0].n, 1);
    await assert.rejects(restoreData(db.pool, tables), /비어 있는/);
    await db.pool.query('INSERT INTO "RecoveryAccountState" ("userId",disabled) VALUES ($1,true)',['u']);
    const key = randomBytes(32).toString('hex');
    const archive = await exportData(db.pool, key);
    assert.ok(!archive.includes('test@example.invalid'));
    await db.pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await restoreData(db.pool, archive, key);
    assert.equal((await db.pool.query('SELECT email FROM "User"')).rows[0].email, 'test@example.invalid');
    assert.equal((await db.pool.query('SELECT disabled FROM "RecoveryAccountState"')).rows[0].disabled,true);
  } finally { await db.stop(); await rm(dir, { recursive: true, force: true }); }
});
