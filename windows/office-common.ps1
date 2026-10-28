$ErrorActionPreference = 'Stop'

function Test-BlackAdministrator {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-BlackNode {
    $installed = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $installed) { return $installed }
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    throw 'Node.js를 찾을 수 없습니다. 기존 앱을 실행할 때 사용한 Node.js를 확인해 주세요.'
}

function Set-BlackHostsEntry([string]$Address) {
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($Address, [ref]$parsed) -or $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw '올바른 IPv4 주소가 필요합니다.' }
    $path = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $text = [IO.File]::ReadAllText($path)
    $text = [regex]::Replace($text, '(?ms)^# BEGIN BLACK OFFICE\r?\n.*?^# END BLACK OFFICE\r?\n?', '')
    $lines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($line in ($text -split '\r?\n')) {
        if ($line -match '^\s*#' -or -not $line.Trim()) { $lines.Add($line); continue }
        $parts = $line -split '#', 2
        $tokens = @($parts[0].Trim() -split '\s+' | Where-Object { $_ })
        if ($tokens.Count -lt 2) { $lines.Add($line); continue }
        $names = @($tokens[1..($tokens.Count - 1)])
        if ($names -notcontains 'gb-8234') { $lines.Add($line); continue }
        $remaining = @($names | Where-Object { $_ -ine 'gb-8234' })
        if ($remaining.Count) {
            $kept = $tokens[0] + "`t" + ($remaining -join ' ')
            if ($parts.Count -gt 1) { $kept += ' #' + $parts[1] }
            $lines.Add($kept)
        } elseif ($parts.Count -gt 1) { $lines.Add('#' + $parts[1]) }
    }
    $newText = (($lines -join "`r`n").TrimEnd() + "`r`n# BEGIN BLACK OFFICE`r`n$Address`tgb-8234`r`n# END BLACK OFFICE`r`n")
    [IO.File]::WriteAllText($path, $newText, (New-Object Text.UTF8Encoding($false)))
    Clear-DnsClientCache
}

function Set-BlackPrivateAcl([string]$Path) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    # Files need direct grants; inheritance flags apply to directories, not files.
    & icacls.exe $Path /inheritance:r /grant:r "*$($sid):F" '*S-1-5-18:F' '*S-1-5-32-544:F' /T /C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '비공개 폴더 접근 권한을 설정하지 못했습니다.' }
    & icacls.exe $Path /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '비공개 폴더 상속 권한을 설정하지 못했습니다.' }
}

function Set-BlackEnv([string]$Path, [hashtable]$Values) {
    $lines = @()
    if (Test-Path $Path) { $lines = @([IO.File]::ReadAllLines($Path)) }
    foreach ($key in $Values.Keys) {
        $lines = @($lines | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($key) + '\s*=') })
        $lines += $key + '=' + $Values[$key]
    }
    [IO.File]::WriteAllLines($Path, $lines, (New-Object Text.UTF8Encoding($false)))
}

function Get-BlackServerIPv4 {
    $candidates = @(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Sort-Object { $_.NetIPv4Interface.InterfaceMetric })
    foreach ($candidate in $candidates) {
        foreach ($ip in $candidate.IPv4Address) {
            if ($ip.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { return $ip.IPAddress }
        }
    }
    throw '활성 사내망의 IPv4 주소를 찾지 못했습니다. 사내망 연결을 확인해 주세요.'
}

# Administrative setup only manages OS settings. All database work uses a
# separate, explicitly limited token; secrets travel over a local pipe only.
function Invoke-BlackLimitedJob([string]$AppPath, [hashtable]$Request) {
    $identifier = [Guid]::NewGuid().ToString('N')
    $pipeName = 'BLACK-Setup-' + $identifier
    $taskName = 'BLACK Setup Worker ' + $identifier
    $pipe = New-Object IO.Pipes.NamedPipeServerStream($pipeName, [IO.Pipes.PipeDirection]::InOut, 1, [IO.Pipes.PipeTransmissionMode]::Byte, [IO.Pipes.PipeOptions]::Asynchronous)
    try {
        $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
        $worker = Join-Path $AppPath 'windows\office-worker.ps1'
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $worker + '" -AppPath "' + $AppPath + '" -PipeName "' + $pipeName + '"') -WorkingDirectory $AppPath
        $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Force | Out-Null
        $pending = $pipe.BeginWaitForConnection($null,$null)
        Start-ScheduledTask -TaskName $taskName
        if (-not $pending.AsyncWaitHandle.WaitOne(45000)) { throw '일반 사용자 작업을 시작하지 못했습니다. 작업 스케줄러의 BLACK Setup Worker 결과 또는 회사 배치 로그온 정책을 확인해야 합니다.' }
        $pipe.EndWaitForConnection($pending)
        $reader = New-Object IO.StreamReader($pipe)
        $writer = New-Object IO.StreamWriter($pipe)
        $writer.AutoFlush = $true
        $writer.WriteLine(($Request | ConvertTo-Json -Compress))
        $response = $reader.ReadLineAsync()
        if (-not $response.Wait(840000)) { throw '일반 사용자 DB 작업의 응답 시간이 초과되었습니다. DB 파일을 삭제하지 말고 작업 상태를 확인하세요.' }
        if (-not $response.Result) { throw '일반 사용자 DB 작업이 결과 없이 종료되었습니다.' }
        $result = $response.Result | ConvertFrom-Json
        if ($result.exitCode -ne 0) { throw ('일반 사용자 DB 작업 실패: ' + $result.error) }
        return $result.output
    } finally {
        $pipe.Dispose()
        # Never forcibly stop an active database worker on a timeout.
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        for ($i=0; $task -and $task.State -eq 'Running' -and $i -lt 10; $i++) { Start-Sleep -Milliseconds 200; $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
        if ($task -and $task.State -ne 'Running') { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue }
    }
}
