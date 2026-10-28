import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import {windowsPgCtlPath,startControlledPostgres} from './pg-control.mjs';

// Prisma stores these timestamp-without-time-zone columns as UTC.
// Keep decoding identical on Korean Windows and the UTC build machine.
pg.types.setTypeParser(1114, value => new Date(value.replace(' ', 'T') + 'Z'));

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function createPool(settings) {
  const pool=new pg.Pool(settings);
  // The embedded runtime may stop PostgreSQL before the Node signal handler.
  // Idle pg clients emit asynchronous errors then; never dump client objects.
  pool.on('error',error=>{if(error.code!=='57P01') console.error('로컬 DB 연결 오류:',error.code||'CONNECTION_ERROR');});
  return pool;
}
export function readConfig() {
  const path = process.env.BLACK_ENV_FILE || join(root, 'private', 'BLACK.env.backup');
  const legacy = existsSync(path) ? dotenv.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : {};
  const local = existsSync(join(root, '.env')) ? dotenv.parse(readFileSync(join(root, '.env'))) : {};
  return { ...legacy, ...local, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('BLACK_'))) };
}

export async function startDatabase({ directory = join(root, 'data'), port = 15434, database = 'black_recovery' } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const credentials = join(directory, 'runtime.json');
  if (!existsSync(credentials)) writeFileSync(credentials, JSON.stringify({ password: randomBytes(32).toString('hex') }), { mode: 0o600, flag: 'wx' });
  const { password } = JSON.parse(readFileSync(credentials));
  const cluster = join(directory, 'postgres');
  const settings = { host: '127.0.0.1', port, user: 'black_local', password };
  if (existsSync(join(cluster, 'PG_VERSION'))) {
    const probe = new pg.Client({ ...settings, database: 'postgres', connectionTimeoutMillis: 1500 });
    try {
      await probe.connect();
      const location = (await probe.query('SHOW data_directory')).rows[0].data_directory;
      if (resolve(location) !== resolve(cluster)) throw new Error('이 포트는 다른 PostgreSQL 인스턴스가 사용 중입니다.');
      const pool = createPool({ ...settings, database });
      return { pool, settings: { ...settings, database }, reused: true, async stop() { await pool.end(); } };
    } catch(e) { if (e.code !== 'ECONNREFUSED') throw e; }
    finally { await probe.end(); }
  }
  let startupLog='';
  const embedded = new EmbeddedPostgres({
    databaseDir: cluster, port, user: 'black_local', password, authMethod: 'scram-sha-256', persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1', ...(process.platform==='win32'?[]:['-k',cluster])],
    onLog: message => { startupLog=(startupLog+String(message)).slice(-6000); }, onError: () => {},
  });
  if (!existsSync(join(cluster, 'PG_VERSION'))) await embedded.initialise();
  let windowsControl;
  if(process.platform==='win32')windowsControl=await startControlledPostgres({executable:await windowsPgCtlPath(),directory:cluster,port});
  else {try { await embedded.start(); } catch { throw new Error('로컬 PostgreSQL을 시작할 수 없습니다: '+startupLog); }}
  const stopPostgres=()=>windowsControl?windowsControl.stop():embedded.stop();
  const admin = new pg.Client({ ...settings, database: 'postgres' });
  try {
    await admin.connect();
    const found = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
    if (!found.rowCount) {
      if (!/^[a-z][a-z0-9_]*$/.test(database)) throw new Error('Invalid local database name');
      await admin.query(`CREATE DATABASE "${database}"`);
    }
  } catch (e) { await stopPostgres(); throw e; }
  finally { await admin.end(); }
  const pool = createPool({ ...settings, database });
  return {
    pool, settings: { ...settings, database },
    async stop() { await pool.end(); await stopPostgres(); },
  };
}
