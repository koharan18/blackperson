$ErrorActionPreference='Stop'
$isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $isAdmin){throw '현재 서버 PC의 관리자 PowerShell에서 실행하세요.'}
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$revision='a6ec7d9e9e753132cf94722c80f8927b83326621'
$tools=Join-Path $env:TEMP 'BLACK-move-tools-a6ec7d9'
if((Test-Path -LiteralPath $tools) -and ((Get-Item -LiteralPath $tools -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '임시 도구 폴더가 연결된 경로입니다.'}
New-Item -ItemType Directory -Force $tools | Out-Null
$files=@(
    @{Source='windows/move-office-app.ps1';Target='move-office-app.ps1';Sha='77780dd9322febff8abb70a52b8595ca632f24351c655d989e884918d1b69895'},
    @{Source='scripts/migration-snapshot.mjs';Target='BLACK-migration-snapshot.mjs';Sha='e0246cd35f2ed0a7e6e06cfddf402ed7773937aeddf4c788bfc25c55dfbc55f5'},
    @{Source='server/runtime.mjs';Target='BLACK-move-runtime/runtime.mjs';Sha='f1a79b495fbe802d77b397527e11a91f1ba3788aee967d753cae180a5eea1162'},
    @{Source='server/pg-control.mjs';Target='BLACK-move-runtime/pg-control.mjs';Sha='67fd1287b371f662aa6a4d33eed1254c69839963926427329abb85b3a3c0db41'},
    @{Source='server/windows-paths.mjs';Target='BLACK-move-runtime/windows-paths.mjs';Sha='f95af80b15d316cc29d40a5d2400bf2f724605134f78a264be04199167968d74'}
)
foreach($file in $files){
    $target=Join-Path $tools $file.Target
    New-Item -ItemType Directory -Force (Split-Path $target -Parent) | Out-Null
    Invoke-WebRequest ('https://raw.githubusercontent.com/koharan18/blackperson/'+$revision+'/'+$file.Source) -UseBasicParsing -OutFile $target
    if((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ine $file.Sha){throw ('이전 프로그램 검증 실패: '+$file.Target)}
}
Write-Host '다운로드 원본을 보존하며 바탕화면 코덱스\BLACK으로 이전을 시작합니다. 잠시 앱이 중지됐다가 새 위치에서 실행됩니다.'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $tools 'move-office-app.ps1')
if($LASTEXITCODE -ne 0){throw '이전이 완료되지 않았습니다. 위 오류를 확인하세요. 원본 폴더는 삭제하지 마세요.'}
