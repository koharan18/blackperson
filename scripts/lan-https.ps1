# Optional Windows-only setup. Run explicitly from an Administrator PowerShell.
# Creates a private server certificate and a public trust certificate; does not
# change computer names, DNS, hosts entries, or client trust automatically.
$ErrorActionPreference = 'Stop'
$blackRoot = Split-Path $PSScriptRoot -Parent
Set-Location $blackRoot
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw '관리자 권한 PowerShell에서 실행해 주세요.'
}
if (Test-Path '.env') { throw '.env가 이미 있습니다. 기존 설정을 보존하기 위해 중단했습니다. README의 수동 설정을 확인해 주세요.' }
New-Item -ItemType Directory -Force 'private' | Out-Null
if (Test-Path 'private\tls.pfx') { throw '기존 인증서가 있습니다. 덮어쓰지 않았습니다.' }
$blackRandom = New-Object byte[] 32
$blackRng = [Security.Cryptography.RandomNumberGenerator]::Create()
$blackRng.GetBytes($blackRandom)
$blackRng.Dispose()
$blackPassword = [Convert]::ToBase64String($blackRandom)
$blackSecure = ConvertTo-SecureString $blackPassword -AsPlainText -Force
$blackCert = New-SelfSignedCertificate -DnsName 'gb-8234', $env:COMPUTERNAME, 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddYears(1) -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable
Export-PfxCertificate -Cert $blackCert -FilePath 'private\tls.pfx' -Password $blackSecure | Out-Null
Export-Certificate -Cert $blackCert -FilePath 'private\BLACK-server.cer' | Out-Null
@{ password = $blackPassword } | ConvertTo-Json | Set-Content 'private\tls.json' -Encoding UTF8
@('BLACK_BIND_HOST=0.0.0.0', 'BLACK_PORT=443', 'BLACK_HTTPS=true', 'BLACK_PUBLIC_ORIGIN=https://gb-8234') | Set-Content '.env' -Encoding ASCII
if (-not (Get-NetFirewallRule -DisplayName 'BLACK HTTPS - Private LAN' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'BLACK HTTPS - Private LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -Profile Private -RemoteAddress LocalSubnet | Out-Null
}
Write-Host 'HTTPS 설정 파일 생성 완료. 3-start.cmd로 서버를 재시작하세요.'
Write-Host '직원 PC에는 공개 인증서 BLACK-server.cer와 gb-8234 이름 해석 설정이 필요합니다. README를 확인하세요.'
Write-Host 'private의 .pfx 및 tls.json은 직원에게 배포하지 마세요.'
