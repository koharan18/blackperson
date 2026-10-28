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
