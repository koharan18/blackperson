param([string]$AppPath = (Join-Path $env:USERPROFILE 'Downloads\BLACK-recovery\BLACK'))
$ErrorActionPreference = 'Stop'
. (Join-Path $AppPath 'windows\office-common.ps1')
if (-not (Test-BlackAdministrator)) { throw '현재 서버 PC의 관리자 PowerShell에서 실행하세요.' }
$computer = Get-CimInstance Win32_ComputerSystem
if ($computer.PartOfDomain -and $env:COMPUTERNAME -ine 'GB-8234') { throw '도메인 가입 PC의 이름은 이 스크립트로 변경하지 않습니다. 현재 도메인 관리자 절차가 필요합니다.' }
$officePath = Join-Path $AppPath 'private\office.json'
if (-not (Test-Path -LiteralPath $officePath)) { throw '완료된 BLACK 서버 설정을 찾지 못했습니다.' }
$office = Get-Content -LiteralPath $officePath -Raw | ConvertFrom-Json
$adapter = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway -and $_.InterfaceAlias -eq '이더넷' } | Select-Object -First 1
if (-not $adapter) { throw '현재 사용 중인 이더넷 사내망을 찾지 못했습니다. 다른 연결은 변경하지 않았습니다.' }
$profile = Get-NetConnectionProfile -InterfaceIndex $adapter.InterfaceIndex
$netbios = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -and $_.InterfaceIndex -eq $adapter.InterfaceIndex } | Select-Object -First 1
if (-not $netbios) { throw '이더넷 이름 해석 설정을 찾지 못했습니다.' }
# Resolve task accounts to immutable SIDs before changing the computer name.
$principals = @{}
foreach ($name in @('BLACK Office Server','BLACK Office Backup')) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction Stop
    $userID = $task.Principal.UserId
    if ($userID -notmatch '^S-1-5-') {
        $account = New-Object Security.Principal.NTAccount($userID)
        $userID = $account.Translate([Security.Principal.SecurityIdentifier]).Value
    }
    $principals[$name] = $userID
}
$backup = Join-Path $AppPath ('private\office-network-before-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
@{computerName=$env:COMPUTERNAME;interfaceIndex=$adapter.InterfaceIndex;interfaceAlias=$adapter.InterfaceAlias;networkCategory=[string]$profile.NetworkCategory;netbios=$netbios.TcpipNetbiosOptions;taskUsers=$principals} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $backup -Encoding UTF8
if ($profile.NetworkCategory -eq 'Public') {
    Set-NetConnectionProfile -InterfaceIndex $adapter.InterfaceIndex -NetworkCategory Private
}
foreach ($rule in @(
    @{Name='BLACK Office HTTPS Local';Protocol='TCP';Ports=@(443)},
    @{Name='BLACK Office Name Resolution';Protocol='UDP';Ports=@(137,5355)}
)) {
    $existing = Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
    if ($existing) { $existing | Remove-NetFirewallRule }
    New-NetFirewallRule -Name $rule.Name -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol $rule.Protocol -LocalPort $rule.Ports -Profile Private,Domain -RemoteAddress LocalSubnet -InterfaceAlias $adapter.InterfaceAlias | Out-Null
}
$result = Invoke-CimMethod -InputObject $netbios -MethodName SetTcpipNetbios -Arguments @{TcpipNetbiosOptions=[uint32]1}
if ($result.ReturnValue -notin @(0,1)) { throw ('이더넷 NetBIOS 설정 실패: ' + $result.ReturnValue) }
foreach ($name in $principals.Keys) {
    $principal = New-ScheduledTaskPrincipal -UserId $principals[$name] -LogonType S4U -RunLevel Limited
    Set-ScheduledTask -TaskName $name -Principal $principal | Out-Null
}
if ($env:COMPUTERNAME -ine 'GB-8234') {
    Rename-Computer -NewName 'GB-8234' -Force -ErrorAction Stop
    Write-Host 'PC 이름 GB-8234 복원을 예약했습니다. 재부팅 후 적용됩니다.'
} else { Write-Host 'PC 이름은 이미 GB-8234입니다.' }
Write-Host '서버 이더넷 사내망과 HTTPS/이름 해석 방화벽 설정 완료.'
Write-Host ('변경 전 설정 보관: ' + $backup)
Write-Host '명단, 계정, 인증서, 직원 PC 설정은 변경하지 않았습니다.'
Write-Host '열려 있는 문서를 저장하고 서버 PC를 재부팅하세요. 직원은 같은 사내망에서 https://GB-8234/login 을 열면 됩니다.'
Write-Host '이름 해석과 HTTPS 신뢰 여부는 재부팅 후 실제 브라우저 결과로 확인해야 합니다. 인증서 경고가 뜨면 경고 문구를 확인하세요.'
