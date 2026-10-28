param([string]$ScriptPath=(Join-Path (Split-Path $PSScriptRoot -Parent) 'windows\restore-office-host.ps1'))
$ErrorActionPreference='Stop'
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('black-network-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force (Join-Path $fixture 'private'),(Join-Path $fixture 'windows') | Out-Null
'function Test-BlackAdministrator { return $true }' | Set-Content (Join-Path $fixture 'windows\office-common.ps1')
'{"serverIPv4":"192.168.100.52"}' | Set-Content (Join-Path $fixture 'private\office.json')
$global:rules=New-Object Collections.Generic.List[object]
$global:taskUsers=New-Object Collections.Generic.List[object]
function Get-CimInstance {param($ClassName) if($ClassName -eq 'Win32_ComputerSystem'){return [pscustomobject]@{PartOfDomain=$false}};return [pscustomobject]@{IPEnabled=$true;InterfaceIndex=12;TcpipNetbiosOptions=0}}
function Get-NetIPConfiguration {return [pscustomobject]@{NetAdapter=[pscustomobject]@{Status='Up'};IPv4DefaultGateway='192.168.100.1';InterfaceAlias='이더넷';InterfaceIndex=12}}
function Get-NetConnectionProfile {param($InterfaceIndex) if($InterfaceIndex -ne 12){throw 'Wrong interface'};return [pscustomobject]@{NetworkCategory='Public'}}
function Set-NetConnectionProfile {param($InterfaceIndex,$NetworkCategory) if($InterfaceIndex -ne 12 -or $NetworkCategory -ne 'Private'){throw 'Wrong profile change'};$global:profileApplied=$true}
function Get-ScheduledTask {param($TaskName,$ErrorAction) return [pscustomobject]@{Principal=[pscustomobject]@{UserId='S-1-5-21-123-1001'}}}
function Get-NetFirewallRule {param($Name,$ErrorAction) return $null}
function New-NetFirewallRule {param($Name,$DisplayName,$Direction,$Action,$Protocol,$LocalPort,$Profile,$RemoteAddress,$InterfaceAlias) $global:rules.Add(@{Protocol=$Protocol;Ports=$LocalPort;Profiles=$Profile;Remote=$RemoteAddress;Interface=$InterfaceAlias})}
function Invoke-CimMethod {param($InputObject,$MethodName,$Arguments) if($MethodName -ne 'SetTcpipNetbios' -or $Arguments.TcpipNetbiosOptions -ne 1){throw 'Wrong name resolution change'};return [pscustomobject]@{ReturnValue=0}}
function New-ScheduledTaskPrincipal {param($UserId,$LogonType,$RunLevel) return @{UserId=$UserId;LogonType=$LogonType;RunLevel=$RunLevel}}
function Set-ScheduledTask {param($TaskName,$Principal) $global:taskUsers.Add($Principal.UserId)}
function Rename-Computer {param($NewName,[switch]$Force,$ErrorAction) $global:renamed=$NewName}
try {
    & $ScriptPath -AppPath $fixture
    if(-not $global:profileApplied -or $global:renamed -ne 'GB-8234'){throw 'Server identity/profile not restored'}
    if($rules.Count -ne 2 -or $rules[0].Protocol -ne 'TCP' -or $rules[0].Ports[0] -ne 443){throw 'Wrong HTTPS rule'}
    if($rules[1].Protocol -ne 'UDP' -or $rules[1].Ports -notcontains 137 -or $rules[1].Ports -notcontains 5355){throw 'Wrong discovery ports'}
    foreach($rule in $rules){if($rule.Remote -ne 'LocalSubnet' -or $rule.Interface -ne '이더넷' -or $rule.Profiles -contains 'Public'){throw 'Rule scope too broad'}}
    if($taskUsers.Count -ne 2 -or $taskUsers[0] -ne 'S-1-5-21-123-1001'){throw 'Task identity not preserved'}
    Write-Host 'PASS: only server Ethernet profile, local-subnet HTTPS/name rules and SID-stable task principals are changed; rename is not auto-restarted.'
} finally {Remove-Variable -Name rules,taskUsers,profileApplied,renamed -Scope Global -ErrorAction SilentlyContinue;Remove-Item -LiteralPath $fixture -Recurse -Force}
