$ErrorActionPreference = 'Stop'
$blackRoot = Split-Path $PSScriptRoot -Parent
$office = Get-Content -LiteralPath (Join-Path $blackRoot 'private\office.json') -Raw | ConvertFrom-Json
# Disable before requesting a clean stop, otherwise RestartCount restarts it.
Disable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
& $office.node (Join-Path $blackRoot 'scripts\stop-office.mjs')
if ($LASTEXITCODE -ne 0) { throw '정상 종료 요청이 실패했습니다. 실행 중인 서버 상태를 확인해 주세요.' }
Write-Host '정상 종료를 요청하고 자동 실행을 일시 중지했습니다. office-start.ps1로 다시 켤 수 있습니다.'
