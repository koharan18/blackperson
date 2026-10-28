. (Join-Path $PSScriptRoot 'office-common.ps1')
if (Test-BlackAdministrator) { Write-Error 'DB 작업은 일반 사용자 권한으로 실행해야 합니다. 관리자 PowerShell 대신 등록된 BLACK 예약 작업을 사용하세요.'; exit 1 }
$ErrorActionPreference = 'Continue'
$blackRoot = Split-Path $PSScriptRoot -Parent
$office = Get-Content -LiteralPath (Join-Path $blackRoot 'private\office.json') -Raw | ConvertFrom-Json
Set-Location $blackRoot
$logDirectory = Join-Path $blackRoot 'private\office-logs'
New-Item -ItemType Directory -Force $logDirectory | Out-Null
$log = Join-Path $logDirectory ('server-' + (Get-Date -Format 'yyyyMMdd') + '.log')
$env:BLACK_OFFICE_MODE = 'true'
& $office.node (Join-Path $blackRoot 'server\index.mjs') >> $log 2>&1
exit $LASTEXITCODE
