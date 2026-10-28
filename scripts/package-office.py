"""Build a code-only Windows office bootstrap; never package local state."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
output = root.parent / 'BLACK-office-setup.zip'
assert (root/'dist/index.html').exists(), 'Build the frontend before packaging'
paths = []
for directory in ['server','src','dist','scripts','windows','tests','docs']:
    paths.extend(p for p in (root/directory).rglob('*') if p.is_file() and p != root/'windows/setup-office.ps1')
for name in ['README.md','index.html','vite.config.mjs','playwright.config.mjs','1-install.cmd','2-restore.cmd','3-start.cmd','4-backup.cmd']:
    if (root/name).is_file(): paths.append(root/name)

def content(path):
    data = path.read_bytes()
    if path.suffix == '.ps1':
        data = b'\xef\xbb\xbf' + data.removeprefix(b'\xef\xbb\xbf').replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
    elif path.suffix == '.cmd':
        data = data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
    return data

revision = subprocess.run(['git','rev-parse','HEAD'],cwd=root,capture_output=True,text=True,check=True).stdout.strip()
payload = {p.relative_to(root).as_posix():content(p) for p in sorted(paths)}
assert all(not p.startswith(('private/','data/','backups/','.git/','node_modules/')) for p in payload)
manifest = {'format':'BLACK-OFFICE-UPDATE-1','sourceCommit':revision,'files':{p:hashlib.sha256(data).hexdigest() for p,data in payload.items()}}
launcher = '@echo off\nchcp 65001 >nul\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP-SERVER.ps1"\npause\n'
guide = '''BLACK 사내 운영 설정

서버 PC에서만 실행:
1. 기존 BLACK 서버 실행 창에서 Ctrl+C로 종료하세요.
2. 이 ZIP을 별도 폴더에 풀고 SETUP-SERVER.cmd를 실행하세요.
3. Windows 관리자 권한을 승인하고 직원 공통 비밀번호를 한 번 입력하세요.
4. 완료 시 https://GB-8234/login 이 열립니다. 재부팅 후 다른 PC 접속까지 확인하세요.

기존 앱 위치: 다운로드\\BLACK-recovery\\BLACK
다른 위치인 경우 관리자 PowerShell에서:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\SETUP-SERVER.ps1 -AppPath "실제 앱 폴더"

설정 후 기존 앱 폴더에 BLACK-staff-connect.zip이 만들어집니다.
직원에게는 이 공개 접속 설정 ZIP만 전달하세요.
직원 PC마다 같은 사내망에서 압축을 풀고 CLIENT-SETUP.cmd를 관리자 권한으로 한 번 실행합니다.
서버 IP가 바뀌지 않도록 공유기/사내 DHCP 예약이 필요합니다.

기존 명단/키/다른 관리자 계정은 보존합니다. 새 직원은 일반 사용자이며 기존 직원 역할은 유지합니다.
직원 5개 계정의 비밀번호는 입력한 공통 비밀번호로 설정합니다. 다른 계정은 바꾸지 않습니다.
부팅 20초 후 서버 자동 실행, 부팅 2분 후 및 매일 17:30 암호화 데이터·키·코드 백업을 등록합니다.
문서\\BLACK-Backups는 PC 내부 백업입니다. 외장 드라이브에도 이 폴더를 복사하세요.
GitHub에는 코드만 보관하며 명단/비밀번호/키를 올리지 않습니다.

이 패키지는 Linux에서 코드/계정/백업/종료 로직을 검증했습니다.
Windows 인증서·방화벽·작업 스케줄러는 실제 PC에서 설정 결과와 재부팅 후 동작을 확인해야 합니다.
회사 정책이 S4U/배치 로그온을 막거나 네트워크가 Public이면 IT 담당자의 조치가 필요할 수 있습니다.
실패하면 기존 앱 폴더의 windows\\office-status.ps1 출력을 확인하세요. private 파일은 공유하지 마세요.

자세한 안내: payload\\docs\\office-operation.md
'''
prefix = 'BLACK-office-setup/'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
    for path,data in payload.items(): z.writestr(prefix+'payload/'+path,data)
    z.writestr(prefix+'office-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    z.writestr(prefix+'SETUP-SERVER.ps1',content(root/'windows/setup-office.ps1'))
    z.writestr(prefix+'office-common.ps1',content(root/'windows/office-common.ps1'))
    z.writestr(prefix+'SETUP-SERVER.cmd',launcher.replace('\n','\r\n').encode('utf-8'))
    z.writestr(prefix+'사용방법.txt',guide.replace('\n','\r\n').encode('utf-8-sig'))
with zipfile.ZipFile(output) as z:
    assert z.testzip() is None
    assert all('/private/' not in n and '/data/' not in n and not n.endswith(('.dump','.backup','.xlsx','.csv','.pfx')) for n in z.namelist())
print(f'{output}: {output.stat().st_size} bytes, {len(payload)} source/build files, no records/keys/passwords; Windows execution still requires verification')
