@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 실행 후 브라우저에서 http://127.0.0.1:8234/login 을 여세요.
echo 이 창을 닫으면 서버가 종료됩니다. 종료할 때 Ctrl+C를 누르세요.
echo 사내 HTTPS를 설정했다면 https://gb-8234/login 을 사용하세요.
call npm start
pause
