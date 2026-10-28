@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS를 먼저 설치한 뒤 이 파일을 다시 실행해 주세요.
  echo https://nodejs.org/
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo Node.js 22 이상이 필요합니다. Node.js 24 LTS를 설치해 주세요.
  pause
  exit /b 1
)
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo 설치에 실패했습니다. 이 창의 오류를 확인해 주세요.
  pause
  exit /b 1
)
if not exist private mkdir private
echo 설치 완료. private 폴더에 백업 파일 3개를 넣은 뒤 2-restore.cmd를 실행하세요.
pause
