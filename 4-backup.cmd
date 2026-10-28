@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm run backup
if errorlevel 1 (
  echo 백업에 실패했습니다. 위 오류를 확인해 주세요.
) else (
  echo backups 폴더의 새 백업과 앱 ZIP을 외장 드라이브에 함께 보관하세요.
)
pause
