// A deliberately narrow, data-only reader for PostgreSQL custom archives 1.16.
// Format reference: PostgreSQL src/bin/pg_dump/pg_backup_{archiver,custom}.c.
// Never executes archive SQL. Only the four known BLACK tables are accepted.
import { inflateSync } from 'node:zlib';

export function readDump(buffer) {
  if (buffer.length > 100 * 1024 * 1024) throw new Error('백업은 100MB 이하만 지원합니다.');
  let pos = 0;
  const take = n => {
    if (!Number.isSafeInteger(n) || n < 0 || pos + n > buffer.length) throw new Error('백업 파일이 잘렸거나 손상되었습니다.');
    const result = buffer.subarray(pos, pos + n); pos += n; return result;
  };
  const byte = () => take(1)[0];
  if (take(5).toString() !== 'PGDMP') throw new Error('PostgreSQL custom 백업이 아닙니다.');
  if ([byte(), byte(), byte()].join('.') !== '1.16.0') throw new Error('지원하지 않는 PostgreSQL 백업 버전입니다.');
  const intSize = byte(), offSize = byte(), format = byte(), compression = byte();
  if (intSize !== 4 || offSize !== 8 || format !== 1 || ![0, 1].includes(compression)) throw new Error('지원하지 않는 백업 압축 형식입니다.');
  const int = () => { const sign = byte(); const v = take(4).readUInt32LE(); return sign ? -v : v; };
  const str = () => { const n = int(); return n === -1 ? null : take(n).toString('utf8'); };
  for (let i = 0; i < 7; i++) int();
  str(); str(); str();
  const count = int();
  if (count < 0 || count > 10000) throw new Error('유효하지 않은 백업 목차입니다.');
  const entries = [];
  for (let i = 0; i < count; i++) {
    const id = int(); int(); str(); str(); const tag = str(), desc = str(); int();
    str(); str(); const copy = str(), namespace = str(); str(); str(); int(); str(); str();
    while (str()) { /* dependencies */ }
    const state = byte(), offset = Number(take(8).readBigUInt64LE());
    if (desc === 'TABLE DATA') entries.push({ id, tag, copy, namespace, state, offset });
  }
  const tables = {};
  for (const e of entries) {
    if (!['User', 'RestrictedPerson', 'AuditLog', '_prisma_migrations'].includes(e.tag) || e.namespace !== 'public') throw new Error('예상하지 않은 테이블이 포함되어 있습니다.');
    if (e.state !== 2 || !Number.isSafeInteger(e.offset)) throw new Error('테이블 데이터 위치를 확인할 수 없습니다.');
    pos = e.offset;
    if (byte() !== 1 || int() !== e.id) throw new Error('백업 테이블 데이터가 손상되었습니다.');
    const chunks = [];
    for (;;) { const n = int(); if (n === 0) break; chunks.push(take(n)); }
    const compressed = Buffer.concat(chunks);
    const data = compression ? inflateSync(compressed, { maxOutputLength: 128 * 1024 * 1024 }) : compressed;
    const match = e.copy?.match(/^COPY public\.(?:"[^"]+"|_prisma_migrations) \(([^)]+)\) FROM stdin;/);
    if (!match) throw new Error('유효하지 않은 테이블 열 정보입니다.');
    const cols = match[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const lines = data.toString('utf8').split('\n').filter(s => s && s !== '\\.');
    tables[e.tag] = lines.map(line => {
      const fields = line.split('\t');
      if (fields.length !== cols.length) throw new Error('백업 열 수가 맞지 않습니다.');
      return Object.fromEntries(cols.map((col, i) => [col, decodeCopy(fields[i])]));
    });
  }
  for (const table of ['User', 'RestrictedPerson', 'AuditLog', '_prisma_migrations']) if (!tables[table]) throw new Error('필수 백업 테이블이 없습니다.');
  return tables;
}

function decodeCopy(text) {
  if (text === '\\N') return null;
  const escapes = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' };
  return text.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)/g, (_, ch) => {
    if (/^[0-7]/.test(ch)) return String.fromCharCode(parseInt(ch, 8));
    if (ch[0] === 'x') return String.fromCharCode(parseInt(ch.slice(1), 16));
    return escapes[ch] ?? ch;
  });
}
