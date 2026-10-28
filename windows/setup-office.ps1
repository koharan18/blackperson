param([string]$AppPath,[switch]$ResumeAfterAccounts)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'office-common.ps1')
if (-not (Test-BlackAdministrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    if ($AppPath) { $arguments += @('-AppPath', ('"' + $AppPath + '"')) }
    if ($ResumeAfterAccounts) { $arguments += '-ResumeAfterAccounts' }
    $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $child.ExitCode
}

function Install-BlackCode([string]$Target, [string]$Backup) {
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'office-manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.format -ne 'BLACK-OFFICE-UPDATE-1') { throw '설치 파일 형식이 다릅니다.' }
    $required = @('server/index.mjs','server/office-accounts.mjs','server/office-control.mjs','scripts/setup-office-accounts.mjs','windows/office-run.ps1')
    foreach ($name in $required) { if (-not $manifest.files.PSObject.Properties[$name]) { throw '필수 설치 파일이 없습니다.' } }
    $payload = Join-Path $PSScriptRoot 'payload'
    foreach ($entry in $manifest.files.PSObject.Properties) {
        $relative = $entry.Name
        if ($relative -match '[:\\]' -or $relative -match '(^|/)\.\.(/|$)' -or $relative -notmatch '^(server/|src/|dist/|scripts/|windows/|tests/|docs/|README\.md$|index\.html$|vite\.config\.mjs$|playwright\.config\.mjs$|[1-4]-(install|restore|start|backup)\.cmd$)') { throw '허용되지 않은 설치 경로입니다.' }
        $source = Join-Path $payload $relative
        $destination = [IO.Path]::GetFullPath((Join-Path $Target $relative))
        if (-not $destination.StartsWith($Target.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '설치 경로가 앱 폴더를 벗어납니다.' }
        $ancestor = $Target
        foreach ($part in ($relative -split '[/\\]')) {
            $ancestor = Join-Path $ancestor $part
            if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '연결된 폴더/파일 경로는 자동으로 덮어쓰지 않습니다.' }
        }
        if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ine $entry.Value) { throw '설치 파일 검증에 실패했습니다. ZIP을 다시 받아 주세요.' }
    }
    foreach ($entry in $manifest.files.PSObject.Properties) {
        $source = Join-Path $payload $entry.Name
        $destination = Join-Path $Target $entry.Name
        if (Test-Path -LiteralPath $destination) {
            $old = Join-Path $Backup $entry.Name
            New-Item -ItemType Directory -Force (Split-Path $old -Parent) | Out-Null
            Copy-Item -LiteralPath $destination -Destination $old
        }
        New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

try {
    if (-not $AppPath) { $AppPath = Join-Path $env:USERPROFILE 'Downloads\BLACK-recovery\BLACK' }
    $AppPath = [IO.Path]::GetFullPath($AppPath)
    if (-not (Test-Path (Join-Path $AppPath 'package.json'))) { throw '기존 앱 폴더를 찾지 못했습니다. -AppPath로 실제 앱 폴더를 지정해 주세요.' }
    $package = Get-Content -LiteralPath (Join-Path $AppPath 'package.json') -Raw | ConvertFrom-Json
    if ($package.name -ne 'black-recovery') { throw '기존 BLACK 복구 앱 폴더가 아닙니다.' }
    if (-not (Test-Path (Join-Path $AppPath 'private\BLACK.env.backup')) -or -not (Test-Path (Join-Path $AppPath 'data\postgres\PG_VERSION'))) { throw '명단이 복원되어 사용 중인 기존 앱이 필요합니다. 이 설정은 DB를 새로 만들거나 복원하지 않습니다.' }
    $blackNode = Get-BlackNode
    $blackIP = Get-BlackServerIPv4
    $serverTask = Get-ScheduledTask -TaskName 'BLACK Office Server' -ErrorAction SilentlyContinue
    $backupTask = Get-ScheduledTask -TaskName 'BLACK Office Backup' -ErrorAction SilentlyContinue
    if ($backupTask) {
        Disable-ScheduledTask -TaskName 'BLACK Office Backup' | Out-Null
        for ($i = 0; $i -lt 60 -and (Get-ScheduledTask -TaskName 'BLACK Office Backup').State -eq 'Running'; $i++) { Start-Sleep -Seconds 1 }
        if ((Get-ScheduledTask -TaskName 'BLACK Office Backup').State -eq 'Running') { throw '기존 백업이 실행 중입니다. 완료 후 다시 설정해 주세요.' }
    }
    if ($serverTask -and $serverTask.State -eq 'Running') {
        Disable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
        & $blackNode (Join-Path $AppPath 'scripts\stop-office.mjs')
        if ($LASTEXITCODE -ne 0) { throw '기존 자동 운영 서버를 정상 종료하지 못했습니다.' }
        for ($i = 0; $i -lt 30 -and (Get-ScheduledTask -TaskName 'BLACK Office Server').State -eq 'Running'; $i++) { Start-Sleep -Seconds 1 }
    }
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(443,8234,15434) })
    if ($listeners.Count) { throw '기존 서버가 아직 실행 중이거나 필요한 포트(443/8234/15434)가 사용 중입니다. BLACK 실행 창에서 Ctrl+C로 종료한 뒤 다시 실행하세요. 다른 프로그램은 강제 종료하지 않습니다.' }

    $private = Join-Path $AppPath 'private'
    $before = Join-Path $private ('office-install-backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Force $before | Out-Null
    if (Test-Path (Join-Path $AppPath '.env')) { Copy-Item -LiteralPath (Join-Path $AppPath '.env') -Destination (Join-Path $before 'settings.env') }
    Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\drivers\etc\hosts') -Destination (Join-Path $before 'hosts.before.txt')
    Install-BlackCode $AppPath $before
    $backupDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'BLACK-Backups'
    New-Item -ItemType Directory -Force $backupDirectory | Out-Null
    Set-BlackPrivateAcl $private
    Set-BlackPrivateAcl $backupDirectory
    Set-BlackPrivateAcl (Join-Path $AppPath 'data')
    $runtimePath = Join-Path $AppPath 'data\runtime.json'
    try {
        $runtimeProbe = [IO.File]::Open($runtimePath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $runtimeProbe.Dispose()
    } catch { throw '기존 DB 접속 정보(data\runtime.json)를 읽을 수 없습니다. 이 파일은 삭제하거나 새로 만들지 마세요. 파일 권한 또는 보안 프로그램 차단을 확인해야 합니다.' }
    $keyPath = Join-Path $private 'BLACK.env.backup'
    try {
        $keyProbe = [IO.File]::Open($keyPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $keyProbe.Dispose()
    } catch { throw '원본 환경 키 파일을 읽을 수 없습니다. 파일 권한 또는 보안 프로그램의 접근 차단을 확인해야 합니다. 키 파일은 삭제하거나 새로 만들지 마세요.' }
    Set-Location $AppPath
    Write-Host '기존 명단과 계정의 안전 백업을 먼저 만듭니다.'
    $backupOutput = & $blackNode (Join-Path $AppPath 'scripts\backup.mjs') --output $backupDirectory --json
    if ($LASTEXITCODE -ne 0) { throw '안전 백업에 실패해 설정을 중단했습니다.' }
    $safetyBackup = $backupOutput | ConvertFrom-Json
    if (-not $safetyBackup.folder -or -not (Test-Path -LiteralPath (Join-Path $safetyBackup.folder 'black.black')) -or -not (Test-Path -LiteralPath (Join-Path $safetyBackup.folder 'manifest.json'))) { throw '안전 백업 결과 파일을 확인할 수 없어 중단했습니다.' }
    Write-Host ('안전 백업 완료: ' + $safetyBackup.folder)

    if (-not $ResumeAfterAccounts) {
    Write-Host '알려주신 직원 공통 비밀번호를 입력하세요. 화면과 로그에는 표시되지 않습니다.'
    $secure = Read-Host '직원 공통 비밀번호' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $oldEncoding = $OutputEncoding
    try {
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $OutputEncoding = New-Object Text.UTF8Encoding($false)
        @{ password = $plain } | ConvertTo-Json -Compress | & $blackNode (Join-Path $AppPath 'scripts\setup-office-accounts.mjs')
        if ($LASTEXITCODE -ne 0) { throw '직원 계정 설정에 실패했습니다.' }
    } finally {
        $OutputEncoding = $oldEncoding
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        Remove-Variable plain,secure -ErrorAction SilentlyContinue
    }

    } else { Write-Host '이미 완료된 직원 계정 설정은 건너뜁니다. 비밀번호를 다시 변경하지 않습니다.' }

    $pfxPath = Join-Path $private 'tls.pfx'
    $tlsPath = Join-Path $private 'tls.json'
    $certificate = $null
    if ((Test-Path $pfxPath) -and (Test-Path $tlsPath)) {
        try {
            $tls = Get-Content -LiteralPath $tlsPath -Raw | ConvertFrom-Json
            $candidate = New-Object -TypeName Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList @($pfxPath, $tls.password)
            if (Test-BlackServerCertificate $candidate) { $certificate = $candidate; Write-Host '기존 인증서의 전체 DNS 이름과 유효기간을 확인했습니다.' }
        } catch { Write-Host '기존 인증서 파일을 보존한 뒤 사내 접속용 인증서를 새로 준비합니다.' }
    }
    if (-not $certificate) {
        $tlsHistory = Join-Path $private ('tls-history\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $tlsHistory | Out-Null
        foreach ($name in @('tls.pfx','tls.json','BLACK-server.cer')) {
            $oldFile = Join-Path $private $name
            if (Test-Path -LiteralPath $oldFile) { Copy-Item -LiteralPath $oldFile -Destination $tlsHistory -ErrorAction Stop }
        }
        Write-Host ('사내 접속용 인증서 준비. 이전 파일 보관: ' + $tlsHistory)
        $random = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($random); $rng.Dispose()
        $pfxPassword = [Convert]::ToBase64String($random)
        $pfxSecure = ConvertTo-SecureString $pfxPassword -AsPlainText -Force
        $certificate = New-SelfSignedCertificate -DnsName 'gb-8234','localhost',$env:COMPUTERNAME -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(1) -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -Type SSLServerAuthentication
        Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $pfxSecure -Force | Out-Null
        @{password=$pfxPassword} | ConvertTo-Json | Set-Content -LiteralPath $tlsPath -Encoding UTF8
        Remove-Variable pfxPassword,pfxSecure,random -ErrorAction SilentlyContinue
    }
    $publicCertificate = Join-Path $private 'BLACK-server.cer'
    Export-Certificate -Cert $certificate -FilePath $publicCertificate -Force | Out-Null
    Import-Certificate -FilePath $publicCertificate -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
    Set-BlackEnv (Join-Path $AppPath '.env') @{BLACK_BIND_HOST='0.0.0.0';BLACK_PORT='443';BLACK_HTTPS='true';BLACK_PUBLIC_ORIGIN='https://gb-8234'}
    Set-BlackHostsEntry '127.0.0.1'
    Get-NetFirewallRule -DisplayName 'BLACK HTTPS - Private LAN' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName 'BLACK HTTPS - Private LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private,Domain -RemoteAddress LocalSubnet | Out-Null
    @{node=$blackNode;serverIPv4=$blackIP;backupDirectory=$backupDirectory;installedAt=(Get-Date).ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $private 'office.json') -Encoding UTF8
    Set-BlackPrivateAcl $private
    Set-BlackPrivateAcl (Join-Path $AppPath 'data')
    Set-BlackPrivateAcl $backupDirectory

    $clientDirectory = Join-Path $private 'staff-client'
    New-Item -ItemType Directory -Force $clientDirectory | Out-Null
    Copy-Item -LiteralPath $publicCertificate -Destination (Join-Path $clientDirectory 'BLACK-server.cer') -Force
    Copy-Item -LiteralPath (Join-Path $AppPath 'windows\client-setup.ps1') -Destination (Join-Path $clientDirectory 'CLIENT-SETUP.ps1') -Force
    Copy-Item -LiteralPath (Join-Path $AppPath 'windows\office-common.ps1') -Destination $clientDirectory -Force
    @{serverIPv4=$blackIP;certificateSha256=(Get-FileHash $publicCertificate -Algorithm SHA256).Hash;hostname='gb-8234'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $clientDirectory 'client-config.json') -Encoding UTF8
    @('@echo off','chcp 65001 >nul','powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CLIENT-SETUP.ps1"','pause') | Set-Content -LiteralPath (Join-Path $clientDirectory 'CLIENT-SETUP.cmd') -Encoding ASCII
    $clientZip = Join-Path $AppPath 'BLACK-staff-connect.zip'
    $clientFiles = @('BLACK-server.cer','CLIENT-SETUP.ps1','office-common.ps1','client-config.json','CLIENT-SETUP.cmd') | ForEach-Object { Join-Path $clientDirectory $_ }
    Compress-Archive -Path $clientFiles -DestinationPath $clientZip -Force

    $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $AppPath 'windows\office-run.ps1') + '"') -WorkingDirectory $AppPath
    $startup = New-ScheduledTaskTrigger -AtStartup; $startup.Delay = 'PT20S'
    Register-ScheduledTask -TaskName 'BLACK Office Server' -Action $action -Trigger $startup -Principal $principal -Settings $settings -Force | Out-Null
    $backupAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $AppPath 'windows\office-backup.ps1') + '"') -WorkingDirectory $AppPath
    $daily = New-ScheduledTaskTrigger -Daily -At '17:30'
    $backupStartup = New-ScheduledTaskTrigger -AtStartup; $backupStartup.Delay = 'PT2M'
    $backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName 'BLACK Office Backup' -Action $backupAction -Trigger @($daily,$backupStartup) -Principal $principal -Settings $backupSettings -Force | Out-Null
    & powercfg.exe /change standby-timeout-ac 0
    if ($LASTEXITCODE -ne 0) { throw '전원 연결 중 절전 방지 설정을 적용하지 못했습니다.' }
    & powercfg.exe /change hibernate-timeout-ac 0
    if ($LASTEXITCODE -ne 0) { throw '전원 연결 중 최대 절전 방지 설정을 적용하지 못했습니다.' }
    Enable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
    Enable-ScheduledTask -TaskName 'BLACK Office Backup' | Out-Null
    Start-ScheduledTask -TaskName 'BLACK Office Server'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ready = $false
    for ($i=0;$i -lt 30;$i++) {
        try { $response=Invoke-WebRequest -Uri 'https://gb-8234/api/session' -UseBasicParsing -TimeoutSec 3; $session=$response.Content|ConvertFrom-Json; if ($response.StatusCode -eq 200 -and $session.csrfToken) {$ready=$true;break} } catch {}
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw '예약 작업은 등록했지만 HTTPS 준비 확인에 실패했습니다. private\office-logs와 작업 스케줄러의 마지막 실행 결과를 확인해 주세요.' }
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $AppPath 'windows\office-backup.ps1')
    if ($LASTEXITCODE -ne 0) { throw '최종 코드·데이터 백업이 실패했습니다.' }
    Write-Host '서버 설정 및 현재 HTTPS 응답 확인 완료: https://GB-8234/login' -ForegroundColor Green
    Write-Host ('직원 PC에 전달할 공개 접속 설정 ZIP: ' + $clientZip)
    Write-Host ('자동 백업 폴더: ' + $backupDirectory)
    Write-Host ('현재 서버 사내 IP: ' + $blackIP + ' — 공유기/사내 DHCP에서 이 IP를 예약하세요.')
    Write-Host 'PC 재부팅 후 Windows 로그인 없이 다른 직원 PC에서 열리는지 마지막으로 확인하세요.'
    Write-Host '백업은 현재 PC 안에 있으므로 BLACK-Backups 폴더를 외장 드라이브에도 보관하세요.'
    Start-Process 'https://GB-8234/login'
} catch {
    if ($backupTask -and $backupTask.Settings.Enabled) {
        try { Enable-ScheduledTask -TaskName 'BLACK Office Backup' -ErrorAction Stop | Out-Null } catch { Write-Host '기존 자동 백업 작업을 다시 켜지 못했습니다. 작업 스케줄러에서 BLACK Office Backup을 확인하세요.' -ForegroundColor Yellow }
    }
    Write-Host ('설정을 완료하지 못했습니다: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '기존 명단 DB는 삭제하거나 다시 복원하지 않았습니다. 위 메시지로 중단된 단계를 확인해 주세요.'
    if ($serverTask) {
        Write-Host '기존 자동 서버를 중지한 뒤 실패했다면, 문제를 해결하고 SETUP-SERVER.cmd를 다시 실행하세요.' -ForegroundColor Yellow
        Write-Host ('상태 확인: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $AppPath 'windows\office-status.ps1') + '"')
        Write-Host '기존 설정으로 재시작하려면 앱 폴더에서 windows\office-start.ps1을 실행하세요. 이미 실행 중인 수동 서버와 동시에 시작하지 마세요.'
    }
    Read-Host '내용을 확인한 뒤 Enter를 누르세요'
    exit 1
}
