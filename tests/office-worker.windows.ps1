$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $root 'windows\office-common.ps1')
if (-not (Test-BlackAdministrator)) { throw 'Integration test needs an elevated orchestrator.' }
$fixture = Join-Path $env:TEMP ('black-worker-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force (Join-Path $fixture 'windows'),(Join-Path $fixture 'scripts'),(Join-Path $fixture 'private') | Out-Null
try {
    Copy-Item (Join-Path $root 'windows\office-common.ps1') (Join-Path $fixture 'windows')
    Copy-Item (Join-Path $root 'windows\office-worker.ps1') (Join-Path $fixture 'windows')
    Set-BlackPrivateAcl $fixture
    "console.log(JSON.stringify({folder:'synthetic-folder'}));" | Set-Content (Join-Path $fixture 'scripts\backup.mjs') -Encoding ASCII
    "let text='';for await (const chunk of process.stdin)text+=chunk;const input=JSON.parse(text);if(input.password!=='synthetic-test')process.exit(3);console.log('synthetic accounts passed');" | Set-Content (Join-Path $fixture 'scripts\setup-office-accounts.mjs') -Encoding ASCII
    $result = Invoke-BlackLimitedJob $fixture @{job='backup';outputDirectory=$fixture}
    if (($result|ConvertFrom-Json).folder -ne 'synthetic-folder') { throw 'Backup transport failed' }
    $result = Invoke-BlackLimitedJob $fixture @{job='accounts';password='synthetic-test'}
    if ($result -notmatch 'synthetic accounts passed') { throw 'Account stdin transport failed' }
    Write-Host 'Windows PowerShell 5 + real Limited S4U + pipe + stdin/out checks passed.'
} finally {
    Get-ChildItem (Join-Path $fixture 'private') -Filter 'worker-*.log' -ErrorAction SilentlyContinue | ForEach-Object { Get-Content $_.FullName }
    # Keep synthetic files if a worker is still active; do not kill DB processes.
    $running = @(Get-ScheduledTask | Where-Object { $_.TaskName -like 'BLACK Setup Worker*' -and $_.State -eq 'Running' -and $_.Actions.Arguments -like ('*' + $fixture + '*') })
    if (-not $running.Count) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
