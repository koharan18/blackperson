$ErrorActionPreference = 'Continue'
$blackRoot = Split-Path $PSScriptRoot -Parent
foreach ($name in @('BLACK Office Server','BLACK Office Backup')) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($task) {
        $info = Get-ScheduledTaskInfo -TaskName $name
        Write-Host ($name + ': state=' + $task.State + ', lastResult=' + $info.LastTaskResult + ', lastRun=' + $info.LastRunTime)
    } else { Write-Host ($name + ': not registered') }
}
Get-NetConnectionProfile | Select-Object InterfaceAlias,NetworkCategory | Format-Table -AutoSize
Resolve-DnsName gb-8234 -ErrorAction SilentlyContinue | Where-Object IPAddress | Select-Object Name,IPAddress | Format-Table -AutoSize
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try {
    $response = Invoke-WebRequest -Uri 'https://gb-8234/api/session' -UseBasicParsing -TimeoutSec 10
    $session = $response.Content | ConvertFrom-Json
    Write-Host ('BLACK HTTPS: ' + $response.StatusCode + ', session endpoint ready=' + [bool]$session.csrfToken)
} catch { Write-Host ('BLACK HTTPS: unavailable (' + $_.Exception.Message + ')') }
if (Test-Path (Join-Path $blackRoot 'private\office.json')) {
    $office = Get-Content -LiteralPath (Join-Path $blackRoot 'private\office.json') -Raw | ConvertFrom-Json
    Write-Host ('Backup folder: ' + $office.backupDirectory)
    $latest = Get-ChildItem -LiteralPath $office.backupDirectory -Directory -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Host ('Latest backup folder present: ' + [bool]$latest)
}
