param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Revision)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$downloadRoot = Join-Path $env:USERPROFILE 'Downloads'
$manifestFile = Get-ChildItem -LiteralPath $downloadRoot -Filter 'office-manifest.json' -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $manifestFile) { throw '기존에 압축을 푼 BLACK 사내 설정 폴더를 찾지 못했습니다.' }
$setupRoot = $manifestFile.Directory.FullName
$manifest = Get-Content -LiteralPath $manifestFile.FullName -Raw | ConvertFrom-Json
if ($manifest.format -ne 'BLACK-OFFICE-UPDATE-1') { throw '기존 설치기 형식이 다릅니다.' }
$hashes = @{
    'windows/office-common.ps1' = 'd9ae1b0f212f1a8eea51a7a18812159de3a99a960971c8149b65988a65091f21'
    'windows/office-worker.ps1' = 'cd81614b72318b2b106e7032909fdda51431cd2d339525facd225af0d48a841e'
    'windows/setup-office.ps1' = '0c32c74c17610d5521459a72a44e9218bbd4931fab4dd576e6833e535ab027ae'
    'windows/office-run.ps1' = '854716a40d81ee2c7198072739e5b10ebe11b78ae9131c91c06926adaeda69b0'
    'windows/office-backup.ps1' = '0597550838a736f09320e557c70ca8ec3d6d4650c8d1938a07ee441ed84d5cea'
    'server/index.mjs' = '834ccc28cee10b472742db460d224f082eed8bd9127ad6987be165de439f6b2c'
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
& (Join-Path $setupRoot 'SETUP-SERVER.ps1') -AppPath (Join-Path $downloadRoot 'BLACK-recovery\BLACK')
