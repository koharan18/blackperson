import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync} from 'node:fs';
import {createHash, randomBytes} from 'node:crypto';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {homedir} from 'node:os';

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const allowed = /^(dist\/(?:assets\/[A-Za-z0-9._-]+|index\.html)|src\/[A-Za-z0-9._-]+|tests\/ui\.spec\.mjs)$/;
function inside(root, path) {
  const diff = relative(root, path);
  return !isAbsolute(diff) && diff !== '..' && !diff.startsWith('..' + sep);
}
function checkedTarget(root, path) {
  const full = resolve(root, path);
  if (!inside(root, full)) throw new Error('허용되지 않은 업데이트 경로입니다.');
  let current = root;
  for (const part of relative(root, full).split(sep)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('연결된 폴더 경로는 자동 업데이트하지 않습니다.');
  }
  return full;
}
function isApp(root) {
  try {return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name === 'black-recovery' && existsSync(join(root, 'server', 'index.mjs'));}
  catch {return false;}
}

export function applyDesignUpdate(bundleDirectory, targetDirectory) {
  const bundle = realpathSync(bundleDirectory), target = realpathSync(targetDirectory);
  if (!isApp(target)) throw new Error('기존 BLACK 복구 앱 폴더가 아닙니다.');
  const manifest = JSON.parse(readFileSync(join(bundle, 'update-manifest.json'), 'utf8'));
  if (manifest.format !== 'BLACK-UI-UPDATE-1' || !manifest.files || typeof manifest.files !== 'object') throw new Error('업데이트 검증 정보를 읽을 수 없습니다.');
  const files = Object.entries(manifest.files);
  if (!files.length || files.length > 300 || !manifest.files['dist/index.html']) throw new Error('업데이트 검증 정보에 화면 파일이 없습니다.');
  // Validate the ENTIRE bundle before touching the installed application.
  for (const [path, checksum] of files) {
    if (!allowed.test(path)) throw new Error('허용되지 않은 업데이트 경로입니다.');
    const source = realpathSync(resolve(bundle, path));
    if (!inside(bundle, source) || !/^[a-f\d]{64}$/.test(checksum) || hash(source) !== checksum) throw new Error('업데이트 파일 검증에 실패했습니다. ZIP을 다시 받아 주세요.');
    checkedTarget(target, path);
  }
  const changed = files.filter(([path, checksum]) => !existsSync(join(target, path)) || hash(join(target, path)) !== checksum);
  if (!changed.length) return {updated: 0, target, backup: null};
  const backup = checkedTarget(target, join('.ui-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex')));
  mkdirSync(backup, {recursive: true});
  for (const [path] of changed) {
    const old = join(target, path);
    if (existsSync(old)) {mkdirSync(dirname(join(backup, path)), {recursive: true}); copyFileSync(old, join(backup, path));}
  }
  // Hashed assets first, HTML last. Keep old assets for tabs already open.
  const ordered = changed.filter(([path]) => path !== 'dist/index.html');
  if (changed.some(([path]) => path === 'dist/index.html')) ordered.push(['dist/index.html']);
  for (const [path] of ordered) {
    const destination = checkedTarget(target, path);
    mkdirSync(dirname(destination), {recursive: true});
    if (path === 'dist/index.html') {
      const next = checkedTarget(target, 'dist/index.html.black-update-next');
      copyFileSync(join(bundle, path), next); renameSync(next, destination);
    } else copyFileSync(join(bundle, path), destination);
  }
  writeFileSync(join(backup, 'README.txt'), 'Previous UI files only. Database, private keys, backend and dependency files were not modified. Copy these src/dist files back to undo this UI update.\r\n');
  return {updated: changed.length, target, backup};
}

function findApp() {
  const downloads = join(process.env.USERPROFILE || homedir(), 'Downloads');
  const known = join(downloads, 'BLACK-recovery', 'BLACK');
  if (isApp(known)) return known;
  const found = [];
  const skip = new Set(['node_modules', 'data', 'private', '.git', '.ui-backups', 'backups']);
  function visit(path, depth) {
    if (isApp(path)) {found.push(path); return;}
    if (!depth) return;
    let entries; try {entries = readdirSync(path, {withFileTypes: true});} catch {return;}
    for (const entry of entries) if (entry.isDirectory() && !skip.has(entry.name)) visit(join(path, entry.name), depth - 1);
  }
  visit(downloads, 4);
  if (found.length !== 1) throw new Error(found.length ? '앱 폴더가 여러 개입니다. 적용할 앱 폴더를 명령 인수로 지정해 주세요.' : '다운로드 폴더에서 기존 앱을 찾지 못했습니다. 앱 폴더를 명령 인수로 지정해 주세요.');
  return found[0];
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const result = applyDesignUpdate(dirname(fileURLToPath(import.meta.url)), process.argv[2] || findApp());
    console.log(result.updated ? '디자인 업데이트 완료.' : '이미 최신 디자인입니다.');
    console.log('적용 위치:', result.target);
    if (result.backup) console.log('이전 화면 백업:', result.backup);
    console.log('브라우저에서 Ctrl+F5를 눌러 새 화면을 불러오세요. 서버 재설치나 데이터 복원은 필요하지 않습니다.');
  } catch (error) {console.error('업데이트 중단:', error.message); process.exitCode = 1;}
}
