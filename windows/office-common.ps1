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

function Read-BlackDerLength([byte[]]$Bytes, [ref]$Position) {
    if ($Position.Value -ge $Bytes.Length) { throw 'Invalid certificate extension' }
    [int]$length = $Bytes[$Position.Value]; $Position.Value++
    if ($length -band 128) {
        $count = $length -band 127
        if ($count -lt 1 -or $count -gt 3 -or $Position.Value + $count -gt $Bytes.Length) { throw 'Invalid certificate extension' }
        $length = 0
        for ($i=0; $i -lt $count; $i++) { $length = ($length -shl 8) -bor $Bytes[$Position.Value]; $Position.Value++ }
    }
    return $length
}

function Get-BlackCertificateDnsNames($Certificate) {
    $extension = $Certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | Select-Object -First 1
    if (-not $extension) { return }
    [byte[]]$bytes = $extension.RawData
    if ($bytes.Length -lt 2 -or $bytes[0] -ne 48) { throw 'Invalid certificate extension' }
    $position = 1
    $length = Read-BlackDerLength $bytes ([ref]$position)
    $end = $position + $length
    if ($end -ne $bytes.Length) { throw 'Invalid certificate extension' }
    while ($position -lt $end) {
        $tag = $bytes[$position]; $position++
        $length = Read-BlackDerLength $bytes ([ref]$position)
        if ($position + $length -gt $end) { throw 'Invalid certificate extension' }
        if ($tag -eq 130) { [Text.Encoding]::ASCII.GetString($bytes,$position,$length) }
        $position += $length
    }
}

function Test-BlackServerCertificate($Certificate) {
    if (-not $Certificate.HasPrivateKey -or $Certificate.NotBefore -gt (Get-Date) -or $Certificate.NotAfter -lt (Get-Date).AddDays(30)) { return $false }
    try { return (@(Get-BlackCertificateDnsNames $Certificate) -icontains 'gb-8234') } catch { return $false }
}
