$ErrorActionPreference = 'Stop'
Enable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
Start-ScheduledTask -TaskName 'BLACK Office Server'
Write-Host 'BLACK 자동 운영 서버를 시작했습니다.'
