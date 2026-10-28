param([string]$ServerAddress)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'office-common.ps1')
if (-not (Test-BlackAdministrator)) {
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    if ($ServerAddress) { $arguments += @('-ServerAddress', ('"' + $ServerAddress + '"')) }
    $child = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $child.ExitCode
}
try {
    $config = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'client-config.json') -Raw | ConvertFrom-Json
    $certificatePath = Join-Path $PSScriptRoot 'BLACK-server.cer'
    if ((Get-FileHash $certificatePath -Algorithm SHA256).Hash -ine $config.certificateSha256) { throw '서버 공개 인증서 검증에 실패했습니다.' }
    if (-not $ServerAddress) { $ServerAddress = $config.serverIPv4 }
    if ($ServerAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') { throw '사내망의 IPv4 주소를 사용해 주세요.' }
    $hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    Copy-Item -LiteralPath $hosts -Destination (Join-Path $PSScriptRoot ('hosts-before-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt'))
    Set-BlackHostsEntry $ServerAddress
    Import-Certificate -FilePath $certificatePath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $response = Invoke-WebRequest -Uri 'https://gb-8234/api/session' -UseBasicParsing -TimeoutSec 15
    if ($response.StatusCode -ne 200) { throw '서버 응답이 정상적이지 않습니다.' }
    Write-Host '접속 설정 완료: https://GB-8234/login'
    Start-Process 'https://GB-8234/login'
} catch {
    Write-Host ('접속 설정을 완료하지 못했습니다: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host '서버 PC 전원, 사내망 연결, 서버 IP와 방화벽을 확인해 주세요.'
    Read-Host '내용을 확인한 뒤 Enter를 누르세요'
    exit 1
}
