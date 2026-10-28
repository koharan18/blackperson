$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'windows\office-common.ps1')
$certificates = New-Object Collections.Generic.List[object]
try {
    $multi = New-SelfSignedCertificate -DnsName 'localhost','GB-8234' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(90) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -Type SSLServerAuthentication
    $certificates.Add($multi)
    if (-not (Test-BlackServerCertificate $multi)) { throw 'Valid GB-8234 SAN must pass even when localhost is first' }
    $names = @(1..12 | ForEach-Object { 'additional-office-name-' + $_ + '.local' }) + @('gb-8234')
    $long = New-SelfSignedCertificate -DnsName $names -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(90) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -Type SSLServerAuthentication
    $certificates.Add($long)
    if (-not (Test-BlackServerCertificate $long)) { throw 'Long DER SAN lengths must pass' }
    $wrong = New-SelfSignedCertificate -DnsName 'localhost' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(90) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -Type SSLServerAuthentication
    $certificates.Add($wrong)
    if (Test-BlackServerCertificate $wrong) { throw 'Wrong hostname must fail' }
    $soon = New-SelfSignedCertificate -DnsName 'gb-8234' -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(10) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable -Type SSLServerAuthentication
    $certificates.Add($soon)
    if (Test-BlackServerCertificate $soon) { throw 'Near-expiry certificate must require renewal' }
    Write-Host 'PASS: Windows certificate full SAN, alternate primary DNS, long DER length, wrong hostname and near-expiry checks.'
} finally {
    foreach ($cert in $certificates) { Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $cert.Thumbprint) -Force }
}
