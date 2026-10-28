"""Package an existing Vite build and UI sources, never database or secrets."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
output = root.parent / 'BLACK-design-update.zip'
files = [p for p in (root / 'dist').rglob('*') if p.is_file()]
files += [p for p in (root / 'src').rglob('*') if p.is_file()]
files += [root / 'tests' / 'ui.spec.mjs']
assert (root / 'dist' / 'index.html').exists(), 'Run npm run build first'
manifest = {'format': 'BLACK-UI-UPDATE-1', 'files': {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
launcher = '''@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "BLACK_NODE=node"
if exist "%ProgramFiles%\\nodejs\\node.exe" set "BLACK_NODE=%ProgramFiles%\\nodejs\\node.exe"
"%BLACK_NODE%" "%~dp0apply-design-update.mjs"
if errorlevel 1 echo 위 오류를 확인해 주세요. 데이터와 비밀 키를 지우거나 다시 복원하지 마세요.
pause
'''
instructions = '''BLACK 디자인 업데이트

1. 이 ZIP을 다운로드 폴더의 별도 폴더에 압축 해제하세요.
2. UPDATE.cmd를 더블클릭하세요.
3. 기존 브라우저 창에서 Ctrl+F5를 누르세요.

기존 Downloads\\BLACK-recovery\\BLACK 폴더를 우선 사용합니다.
화면 빌드 파일(dist), 프론트엔드 소스(src), UI 테스트만 교체합니다.
data, private, server, package.json 및 잠금 파일에는 쓰지 않습니다.
이전 화면은 기존 앱의 .ui-backups 폴더에 보관합니다.
열려 있는 탭을 위해 이전 해시 자산 파일도 남겨 둡니다.
Node.js 재설치나 npm install, 데이터베이스 재복원은 필요하지 않습니다.

계정/직원 관리 메뉴는 상단 사용자 이름을 누르면 나옵니다.
이 업데이트는 화면 복구이며 누락된 명단을 복구하지 않습니다.

자동으로 앱을 찾지 못하면 새 PowerShell에서 다음처럼 대상 폴더를 지정하세요.
node .\\apply-design-update.mjs "C:\\Users\\USER\\Downloads\\BLACK-recovery\\BLACK"
'''
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, 'BLACK-design-update/' + path.relative_to(root).as_posix())
    archive.write(root / 'scripts' / 'apply-design-update.mjs', 'BLACK-design-update/apply-design-update.mjs')
    archive.writestr('BLACK-design-update/update-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    archive.writestr('BLACK-design-update/UPDATE.cmd', launcher.replace('\n', '\r\n').encode('utf-8'))
    archive.writestr('BLACK-design-update/사용방법.txt', instructions.replace('\n', '\r\n').encode('utf-8-sig'))
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert all('/private/' not in n and '/data/' not in n and '/server/' not in n for n in archive.namelist())
print(f'{output}: {output.stat().st_size} bytes; {len(files)} UI files; no database, backend, credentials or dependency changes')
