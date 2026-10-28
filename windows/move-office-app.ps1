param(
    [string]$Source=(Join-Path $env:USERPROFILE 'Downloads\BLACK-recovery\BLACK'),
    [string]$Destination=(Join-Path $env:USERPROFILE 'Desktop\코덱스\BLACK'),
    [string]$HelperPath=(Join-Path $PSScriptRoot 'BLACK-migration-snapshot.mjs'),
    [string]$RuntimePatch=(Join-Path $PSScriptRoot 'BLACK-move-runtime')
)
$ErrorActionPreference='Stop'
. (Join-Path $Source 'windows\office-common.ps1')
if (-not (Test-BlackAdministrator)) { throw '서버 PC의 관리자 PowerShell에서 실행하세요.' }
$Source=[IO.Path]::GetFullPath($Source).TrimEnd('\')
$Destination=[IO.Path]::GetFullPath($Destination).TrimEnd('\')
if ($Source -ieq $Destination -or $Destination.StartsWith($Source+'\',[StringComparison]::OrdinalIgnoreCase) -or $Source.StartsWith($Destination+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '원본과 대상 폴더가 같거나 겹칩니다.' }
foreach($path in @($Source,$Destination)) {
    if ($path.StartsWith('\\') -or ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($path))).DriveType -ne 'Fixed') { throw 'DB는 로컬 디스크 폴더에만 이전합니다.' }
    $ancestor=$path
    while($ancestor) {
        if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw '연결/리디렉션된 폴더는 자동 이전하지 않습니다.' }
        $ancestor=Split-Path $ancestor -Parent
    }
    foreach($sync in @($env:OneDrive,$env:OneDriveCommercial,$env:OneDriveConsumer)) {
        if($sync -and ($path -ieq $sync -or $path.StartsWith($sync.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase))) { throw '실행 DB를 OneDrive 동기화 폴더로 이전하지 않습니다.' }
    }
}
if ((Get-FileHash -LiteralPath $HelperPath -Algorithm SHA256).Hash -ine 'e0246cd35f2ed0a7e6e06cfddf402ed7773937aeddf4c788bfc25c55dfbc55f5') { throw '이전 검증 프로그램의 파일 검증에 실패했습니다.' }
$runtimeFiles=@{
    'runtime.mjs'='f1a79b495fbe802d77b397527e11a91f1ba3788aee967d753cae180a5eea1162'
    'pg-control.mjs'='67fd1287b371f662aa6a4d33eed1254c69839963926427329abb85b3a3c0db41'
    'windows-paths.mjs'='f95af80b15d316cc29d40a5d2400bf2f724605134f78a264be04199167968d74'
}
foreach($name in $runtimeFiles.Keys){if((Get-FileHash -LiteralPath (Join-Path $RuntimePatch $name) -Algorithm SHA256).Hash -ine $runtimeFiles[$name]){throw '한글 경로 지원 코드의 검증에 실패했습니다.'}}
$package=Get-Content (Join-Path $Source 'package.json') -Raw | ConvertFrom-Json
if($package.name -ne 'black-recovery' -or -not(Test-Path (Join-Path $Source 'data\postgres\PG_VERSION'))) { throw '실제 사용 중인 BLACK 앱을 찾지 못했습니다.' }
$serverTask=Get-ScheduledTask -TaskName 'BLACK Office Server'
$backupTask=Get-ScheduledTask -TaskName 'BLACK Office Backup'
if([IO.Path]::GetFullPath($serverTask.Actions[0].WorkingDirectory).TrimEnd('\') -ieq $Destination) { Write-Host ('이미 새 위치로 등록돼 있습니다: '+$Destination);exit 0 }
if([IO.Path]::GetFullPath($serverTask.Actions[0].WorkingDirectory).TrimEnd('\') -ine $Source) { throw '현재 자동 실행 경로가 예상한 원본과 다릅니다.' }
if(Test-Path -LiteralPath $Destination) { throw '대상 BLACK 폴더가 이미 있습니다. 기존 파일을 덮어쓰지 않았습니다.' }
if(-not(Test-Path -LiteralPath (Split-Path $Destination -Parent))) { throw '선택한 바탕화면 상위 폴더가 없습니다.' }
$office=Get-Content (Join-Path $Source 'private\office.json') -Raw | ConvertFrom-Json
foreach($external in @($office.node,$office.backupDirectory,$env:BLACK_ENV_FILE)) {
    if($external -and $external.StartsWith($Source+'\',[StringComparison]::OrdinalIgnoreCase)) { throw '원본 내부를 절대 경로로 참조하는 실행/백업/환경 설정이 있어 자동 이전하지 않습니다.' }
}
Get-ChildItem (Join-Path $Source 'data\postgres') -Filter '*.conf' -File | ForEach-Object {
    foreach($line in Get-Content $_.FullName) {
        if($line -notmatch '^\s*#' -and ($line.Contains($Source) -or $line.Contains($Source.Replace('\','/')))) { throw 'PostgreSQL 설정에 원본 절대 경로가 있습니다.' }
    }
}
$aliasProbe=& $office.node (Join-Path $RuntimePatch 'windows-paths.mjs') --probe (Split-Path $Destination -Parent)
if($LASTEXITCODE -ne 0){throw '바탕화면 상위 폴더의 영문 경로 별칭을 확인하지 못했습니다. 기존 앱은 중단하거나 이동하지 않았습니다.'}
$serverEnabled=$serverTask.Settings.Enabled;$backupEnabled=$backupTask.Settings.Enabled
$wasRunning=$serverTask.State -eq 'Running'
$serverAction=$serverTask.Actions;$backupAction=$backupTask.Actions
$serverXml=Export-ScheduledTask -TaskName 'BLACK Office Server';$backupXml=Export-ScheduledTask -TaskName 'BLACK Office Backup'
$destinationStarted=$false;$tasksChanged=$false;$maintenance=$false;$sourceStopRequested=$false;$sourceRetired=$false
function Assert-BlackDatabaseStopped {
    if(@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(443,8234,15434)}).Count -or (Test-Path (Join-Path $Source 'data\postgres\postmaster.pid')) -or (Test-Path (Join-Path $Destination 'data\postgres\postmaster.pid'))) { throw '서버/DB가 아직 실행 중입니다. 실행 중인 DB 파일은 복사하지 않습니다.' }
}
try {
    Disable-ScheduledTask -TaskName 'BLACK Office Backup' | Out-Null
    $maintenance=$true
    for($i=0;$i -lt 120 -and (Get-ScheduledTask -TaskName 'BLACK Office Backup').State -eq 'Running';$i++){Start-Sleep -Seconds 1}
    if((Get-ScheduledTask -TaskName 'BLACK Office Backup').State -eq 'Running'){throw '기존 백업 완료를 기다려야 합니다. 강제 종료하지 않았습니다.'}
    Disable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
    if(Test-Path (Join-Path $Source 'private\office-control.json')) {
        & $office.node (Join-Path $Source 'scripts\stop-office.mjs')
        if($LASTEXITCODE -ne 0){throw '기존 서버 정상 종료에 실패했습니다.'}
        $sourceStopRequested=$true
    }
    for($i=0;$i -lt 45;$i++) {
        $busy=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(443,8234,15434)})
        if(-not $busy.Count -and (Get-ScheduledTask -TaskName 'BLACK Office Server').State -ne 'Running'){break};Start-Sleep -Seconds 1
    }
    Assert-BlackDatabaseStopped
    Write-Host '서버 정상 종료 완료. 이전 전 암호화 백업과 명단 검증 중...'
    $raw=& $office.node (Join-Path $Source 'scripts\backup.mjs') --output $office.backupDirectory --json
    if($LASTEXITCODE -ne 0){throw '이전 전 백업에 실패했습니다.'};$backup=$raw|ConvertFrom-Json
    if(-not $backup.folder -or -not(Test-Path (Join-Path $backup.folder 'black.black'))){throw '이전 전 백업 파일이 없습니다.'}
    $raw=& $office.node $HelperPath $Source
    if($LASTEXITCODE -ne 0){throw '원본 명단 검증에 실패했습니다.'};$before=$raw|ConvertFrom-Json
    Assert-BlackDatabaseStopped
    $serverXml | Set-Content (Join-Path $backup.folder 'server-task-before.xml') -Encoding UTF8
    $backupXml | Set-Content (Join-Path $backup.folder 'backup-task-before.xml') -Encoding UTF8
    $files=New-Object Collections.Generic.List[object]
    $directories=New-Object 'Collections.Generic.Stack[string]';$directories.Push($Source)
    while($directories.Count) {
        $directory=$directories.Pop()
        foreach($entry in Get-ChildItem -LiteralPath $directory -Force) {
            if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw ('연결된 파일/폴더는 자동 복사하지 않습니다: '+$entry.FullName)}
            if($entry.PSIsContainer){$directories.Push($entry.FullName)}else{$files.Add($entry)}
        }
    }
    $needed=($files | Measure-Object -Property Length -Sum).Sum+64MB
    if(([IO.DriveInfo]::new([IO.Path]::GetPathRoot($Destination))).AvailableFreeSpace -lt $needed){throw '대상 드라이브의 여유 공간이 부족합니다. 원본은 보존했습니다.'}
    New-Item -ItemType Directory -Path $Destination | Out-Null
    Set-BlackPrivateAcl $Destination
    foreach($task in @($serverTask,$backupTask)) {
        $sid=$task.Principal.UserId
        if($sid -notmatch '^S-1-5-'){$sid=(New-Object Security.Principal.NTAccount($sid)).Translate([Security.Principal.SecurityIdentifier]).Value}
        & icacls.exe $Destination /grant:r "*$($sid):(OI)(CI)F" | Out-Null
        if($LASTEXITCODE -ne 0){throw '자동 실행 계정의 대상 폴더 권한을 설정하지 못했습니다.'}
    }
    Write-Host ('정상 종료된 앱 전체 복사 중: '+$Destination)
    & robocopy.exe $Source $Destination /E /COPY:DAT /DCOPY:DAT /XJ /R:1 /W:1 /NP /NFL /NDL ('/LOG:'+(Join-Path $backup.folder 'move-files.log')) | Out-Null
    if($LASTEXITCODE -ge 8){throw '폴더 복사에 실패했습니다. 다운로드의 원본은 보존돼 있습니다.'}
    Assert-BlackDatabaseStopped
    Write-Host ('복사 파일 검증 중 ('+$files.Count+'개)...')
    $checked=0
    foreach($file in $files) {
        $checked++
        if($checked % 250 -eq 0){Write-Progress -Activity '앱 전체 파일 검증' -Status ($checked.ToString()+'/'+$files.Count) -PercentComplete ([int](100*$checked/$files.Count))}
        $relative=$file.FullName.Substring($Source.Length).TrimStart('\')
        $copy=Join-Path $Destination $relative
        if(-not(Test-Path -LiteralPath $copy) -or (Get-Item -LiteralPath $copy).Length -ne $file.Length -or (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash){throw ('복사 파일 검증 실패: '+$relative)}
    }
    Write-Progress -Activity '앱 전체 파일 검증' -Completed
    $codeBefore=Join-Path $Destination 'private\move-runtime-before'
    New-Item -ItemType Directory -Path $codeBefore | Out-Null
    foreach($name in $runtimeFiles.Keys){
        $target=Join-Path $Destination ('server\'+$name)
        if(Test-Path -LiteralPath $target){Copy-Item -LiteralPath $target -Destination $codeBefore}
        Copy-Item -LiteralPath (Join-Path $RuntimePatch $name) -Destination $target -Force
    }
    Write-Host '새 위치의 명단·계정·기록·암호화 키 검증 중...'
    $raw=& $office.node $HelperPath $Destination
    if($LASTEXITCODE -ne 0){throw '새 위치 DB 검증에 실패했습니다.'};$after=$raw|ConvertFrom-Json
    if($before.format -ne 'BLACK-MOVE-CHECK-1' -or $before.sha256 -ne $after.sha256){throw '원본과 새 위치의 데이터가 일치하지 않습니다.'}
    Assert-BlackDatabaseStopped
    foreach($entry in @(@{Name='BLACK Office Server';Script='office-run.ps1'},@{Name='BLACK Office Backup';Script='office-backup.ps1'})) {
        $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $Destination ('windows\'+$entry.Script))+'"') -WorkingDirectory $Destination
        $tasksChanged=$true
        Set-ScheduledTask -TaskName $entry.Name -Action $action | Out-Null
    }
    $oldIndex=Join-Path $Source 'server\index.mjs'
    Copy-Item -LiteralPath $oldIndex -Destination (Join-Path $Source 'private\move-original-server-index.mjs') -ErrorAction Stop
    $targetLiteral=$Destination | ConvertTo-Json -Compress
    $sourceRetired=$true
    [IO.File]::WriteAllText($oldIndex, ('console.error("BLACK moved to: " + '+$targetLiteral+');'+[Environment]::NewLine+'process.exit(1);'+[Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
    Enable-ScheduledTask -TaskName 'BLACK Office Server' | Out-Null
    $destinationStarted=$true
    Start-ScheduledTask -TaskName 'BLACK Office Server'
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $ready=$false
    for($i=0;$i -lt 45;$i++) {
        if(Test-Path (Join-Path $Destination 'private\office-control.json')) {
            try{
                $control=Get-Content (Join-Path $Destination 'private\office-control.json') -Raw | ConvertFrom-Json
                $sha=[Security.Cryptography.SHA256]::Create()
                $digest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((Join-Path $Destination 'private').ToLowerInvariant())))).Replace('-','').ToLowerInvariant();$sha.Dispose()
                $expected='\\.\pipe\BLACK-'+$digest.Substring(0,20)
                $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$control.pid)
                $listener=@(Get-NetTCPConnection -State Listen -LocalPort 443 -OwningProcess ([int]$control.pid) -ErrorAction SilentlyContinue)
                if($control.endpoint -ne $expected -or $process.CommandLine -notlike ('*'+(Join-Path $Destination 'server\index.mjs')+'*') -or -not $listener.Count){continue}
                $response=Invoke-WebRequest 'https://gb-8234/api/session' -UseBasicParsing -TimeoutSec 3;$session=$response.Content|ConvertFrom-Json
                if($response.StatusCode -eq 200 -and $session.csrfToken){$ready=$true;break}
            }catch{}
        };Start-Sleep -Seconds 1
    }
    if(-not $ready){throw '새 위치로 등록했지만 HTTPS 실행 확인에 실패했습니다. 새 위치의 private\office-logs를 확인해야 합니다. 원본 DB로 자동 되돌리지 않았습니다.'}
    if($backupEnabled){Enable-ScheduledTask -TaskName 'BLACK Office Backup'|Out-Null}
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $Destination 'windows\office-backup.ps1')
    if($LASTEXITCODE -ne 0){throw '새 위치 서버는 실행 중이지만 이전 후 백업이 실패했습니다.'}
    @{source=$Source;destination=$Destination;verifiedAt=(Get-Date).ToString('o');dataSha256=$after.sha256;backupFolder=$backup.folder} | ConvertTo-Json | Set-Content (Join-Path $Destination 'private\app-move.json') -Encoding UTF8
    @('BLACK 앱은 다음 위치로 이전됐습니다:',$Destination,'이 폴더의 이전 DB를 실행하지 마세요. 새 위치 실행 및 재부팅 확인 후 정리할 수 있는 이전 사본입니다.') | Set-Content (Join-Path $Source 'APP-MOVED.txt') -Encoding UTF8
    Write-Host ('앱 이전·명단 일치·HTTPS 실행·자동 실행 경로 갱신 완료: '+$Destination) -ForegroundColor Green
    Write-Host '접속 주소와 직원 계정은 그대로입니다. 직원 PC에서는 작업할 필요가 없습니다.'
    Write-Host '다운로드의 원본은 아직 보존했습니다. 새 위치로 재부팅 실행까지 확인한 뒤 BLACK-recovery 폴더를 정리하세요.'
} catch {
    $message=$_.Exception.Message
    if($maintenance -and -not $destinationStarted) {
        try {
            if($sourceRetired){Copy-Item -LiteralPath (Join-Path $Source 'private\move-original-server-index.mjs') -Destination (Join-Path $Source 'server\index.mjs') -Force}
            if($tasksChanged){Assert-BlackDatabaseStopped;Set-ScheduledTask -TaskName 'BLACK Office Server' -Action $serverAction|Out-Null;Set-ScheduledTask -TaskName 'BLACK Office Backup' -Action $backupAction|Out-Null}
            if($serverEnabled){
                Enable-ScheduledTask -TaskName 'BLACK Office Server'|Out-Null
                if($sourceStopRequested){for($i=0;$i -lt 30 -and (Get-ScheduledTask -TaskName 'BLACK Office Server').State -eq 'Running';$i++){Start-Sleep -Seconds 1}}
                if($wasRunning -and (Get-ScheduledTask -TaskName 'BLACK Office Server').State -ne 'Running'){Start-ScheduledTask -TaskName 'BLACK Office Server'}
            }
            if($backupEnabled){Enable-ScheduledTask -TaskName 'BLACK Office Backup'|Out-Null}
        }catch{Write-Host '기존 자동 실행 복구 상태를 확인해야 합니다. DB를 강제로 종료하지 않았습니다.' -ForegroundColor Yellow}
    }
    Write-Host ('이전을 완료하지 못했습니다: '+$message) -ForegroundColor Red
    Write-Host '다운로드 원본과 복사된 파일은 삭제하지 않았습니다. 새 위치가 실행된 뒤에는 원본의 오래된 DB를 임의로 다시 실행하지 마세요.'
    exit 1
}
