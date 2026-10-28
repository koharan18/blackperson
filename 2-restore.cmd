@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist private\BLACK.env.backup (
  echo private 폴더에 BLACK.env.backup, 원본 .dump, backup-manifest.json을 넣어 주세요.
  if not exist private mkdir private
  start "" explorer.exe "%~dp0private"
  pause
  exit /b 1
)
call npm run restore
if errorlevel 1 (
  echo 복원 실패. 원본 백업은 변경되지 않았습니다. 위 오류를 확인해 주세요.
) else (
  echo 복원 완료. 3-start.cmd를 실행해 주세요. 복원은 한 번만 하면 됩니다.
)
pause
