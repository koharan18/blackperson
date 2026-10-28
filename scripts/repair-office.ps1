param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Revision,[switch]$ResumeAfterAccounts)
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Revision',$Revision)
    if ($ResumeAfterAccounts) { $arguments += '-ResumeAfterAccounts' }
    $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $child.ExitCode
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$downloadRoot = Join-Path $env:USERPROFILE 'Downloads'
$manifestFile = Get-ChildItem -LiteralPath $downloadRoot -Filter 'office-manifest.json' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $manifestFile) { throw '기존에 압축을 푼 BLACK 사내 설정 폴더를 찾지 못했습니다.' }
$setupRoot = $manifestFile.Directory.FullName
$manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json
if ($manifest.format -ne 'BLACK-OFFICE-UPDATE-1') { throw '기존 설치기 형식이 다릅니다.' }
$hashes = @{
    'windows/office-common.ps1' = 'd99eb66a3dd3e05bf9457e86d76e89f0d1fb6f98a64c0c9732c31afcc9af9461'
    'windows/setup-office.ps1' = '4a7827414e4794cfdf91817062e0528808127b9c19b4539e0cd35cd52a76216e'
    'windows/office-run.ps1' = '9af2f44e85296331558573287c3e589e7e60c800d785d4bc2ae298355759fcf9'
    'windows/office-backup.ps1' = '9a870aeb78f84579497d3a64671aae9d0fbcdfc7de5c16b3aa39b7a5d16556a6'
    'server/index.mjs' = '834ccc28cee10b472742db460d224f082eed8bd9127ad6987be165de439f6b2c'
    'server/runtime.mjs' = 'daee35d118835ec96e95c167fb1d89e7dab29d3114f8e4447e58c737757499ce'
    'server/pg-control.mjs' = '1f3854aea9987ff6566f561710feb8fa07e1123d3f847a05c0925e75ed19cf9f'
    'scripts/backup.mjs' = '855d36636c4ddff491c6726d35694027b5c51c946240ea61af5119d9ab3cab17'
    'scripts/restore.mjs' = 'fe38309de8d096ec3032b75534ac9d19e186dbf090927147483fc209b606edc3'
    'scripts/setup-office-accounts.mjs' = '85d848916542196c05e275562bc9dd37d4cd12924c6e22dc5254a94ac41f8a2b'
}
# Download and verify every file before changing the existing installer.
$content = @{}
foreach ($name in $hashes.Keys) {
    $response = Invoke-WebRequest -Uri ('https://raw.githubusercontent.com/koharan18/blackperson/' + $Revision + '/' + $name) -UseBasicParsing
    $stream = $response.RawContentStream
    $stream.Position = 0
    $memory = New-Object IO.MemoryStream
    $stream.CopyTo($memory)
    $bytes = $memory.ToArray()
    $sha = [Security.Cryptography.SHA256]::Create()
    $actual = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()
    $sha.Dispose(); $memory.Dispose()
    if ($actual -ne $hashes[$name]) { throw ('다운로드 파일 검증 실패: ' + $name) }
    if ($name.EndsWith('.ps1')) {
        $text = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF).Replace("`r`n","`n").Replace("`n","`r`n")
        $bytes = [byte[]](@(239,187,191) + [Text.Encoding]::UTF8.GetBytes($text))
    }
    $content[$name] = $bytes
}
# Retire only obsolete setup helpers, never a live PostgreSQL or Node child.
$appRoot = Join-Path $downloadRoot 'BLACK-recovery\BLACK'
$obsolete = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'BLACK Setup Worker *' -and $_.Actions.Arguments -like ('*' + $appRoot + '*') })
if ($obsolete.Count) {
    if (Get-Process postgres -ErrorAction SilentlyContinue) { throw 'PostgreSQL이 실행 중이므로 중지하지 않았습니다. DB 작업이 끝난 뒤 다시 실행해야 합니다.' }
    $processes = @(Get-CimInstance Win32_Process)
    $workers = @($processes | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -like ('*' + $appRoot + '\windows\office-worker.ps1*') })
    $workerIDs = @($workers | ForEach-Object { $_.ProcessId })
    if (@($processes | Where-Object { $_.ParentProcessId -in $workerIDs }).Count) { throw '이전 작업에 실행 중인 자식 프로세스가 있어 강제로 중단하지 않았습니다.' }
    $oldSetup = @($processes | Where-Object { $_.Name -eq 'powershell.exe' -and $_.ProcessId -ne $PID -and $_.CommandLine -like ('*' + (Join-Path $setupRoot 'SETUP-SERVER.ps1') + '*') })
    foreach ($process in $oldSetup) { Stop-Process -Id $process.ProcessId -ErrorAction Stop }
    Start-Sleep -Seconds 2
    foreach ($task in $obsolete) {
        $state = Get-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        if ($state -and $state.State -eq 'Running') {
            if (Get-Process postgres -ErrorAction SilentlyContinue) { throw 'DB가 시작되어 이전 작업을 강제 종료하지 않았습니다.' }
            $current = @(Get-CimInstance Win32_Process)
            if (@($current | Where-Object { $_.ParentProcessId -in $workerIDs }).Count) { throw '이전 작업이 자식 프로세스를 시작하여 중단하지 않았습니다.' }
            Stop-ScheduledTask -TaskName $task.TaskName
        }
        Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction Stop
    }
    Write-Host 'DB를 실행하지 못하고 대기 중이던 이전 설치 작업만 정리했습니다.'
}
$manifest.files.PSObject.Properties.Remove('windows/office-worker.ps1')
$manifest.files.PSObject.Properties.Remove('tests/office-worker.windows.ps1')
$before = Join-Path $setupRoot ('installer-before-repair-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force $before | Out-Null
Copy-Item -LiteralPath $manifestFile.FullName -Destination $before
foreach ($name in $content.Keys) {
    $destinations = @()
    if ($name -eq 'windows/setup-office.ps1') { $destinations += (Join-Path $setupRoot 'SETUP-SERVER.ps1') }
    else {
        $destinations += (Join-Path (Join-Path $setupRoot 'payload') $name)
        $sha = [Security.Cryptography.SHA256]::Create()
        $digest = ([BitConverter]::ToString($sha.ComputeHash($content[$name]))).Replace('-','').ToLowerInvariant()
        $sha.Dispose()
        $manifest.files | Add-Member -NotePropertyName $name -NotePropertyValue $digest -Force
    }
    if ($name -eq 'windows/office-common.ps1') { $destinations += (Join-Path $setupRoot 'office-common.ps1') }
    foreach ($destination in $destinations) {
        if (Test-Path -LiteralPath $destination) {
            $relative = $destination.Substring($setupRoot.Length).TrimStart('\')
            $old = Join-Path $before $relative
            New-Item -ItemType Directory -Force (Split-Path $old -Parent) | Out-Null
            Copy-Item -LiteralPath $destination -Destination $old
        }
        New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
        [IO.File]::WriteAllBytes($destination,$content[$name])
    }
}
$manifest.sourceCommit = $Revision
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestFile.FullName -Encoding UTF8
Write-Host '기존 설치 파일을 검증해 갱신했습니다. 새 폴더를 만들 필요가 없습니다.'
& (Join-Path $setupRoot 'SETUP-SERVER.ps1') -AppPath (Join-Path $downloadRoot 'BLACK-recovery\BLACK') -ResumeAfterAccounts:$ResumeAfterAccounts
