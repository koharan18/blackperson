. (Join-Path $PSScriptRoot 'office-common.ps1')
if (Test-BlackAdministrator) { Write-Error 'DB 작업은 일반 사용자 권한으로 실행해야 합니다. 관리자 PowerShell 대신 등록된 BLACK 예약 작업을 사용하세요.'; exit 1 }
$ErrorActionPreference = 'Stop'
$blackRoot = Split-Path $PSScriptRoot -Parent
$office = Get-Content -LiteralPath (Join-Path $blackRoot 'private\office.json') -Raw | ConvertFrom-Json
Set-Location $blackRoot
try {
    $output = & $office.node (Join-Path $blackRoot 'scripts\backup.mjs') --output $office.backupDirectory --json
    if ($LASTEXITCODE -ne 0) { throw '암호화 데이터 백업에 실패했습니다.' }
    $backup = $output | ConvertFrom-Json
    $sourceNames = @('server','src','dist','scripts','windows','tests','docs','README.md','package.json','package-lock.json','index.html','vite.config.mjs','playwright.config.mjs','.env.example','1-install.cmd','2-restore.cmd','3-start.cmd','4-backup.cmd')
    $sourcePaths = @($sourceNames | ForEach-Object { $candidate = Join-Path $blackRoot $_; if (Test-Path $candidate) { $candidate } })
    Compress-Archive -Path $sourcePaths -DestinationPath (Join-Path $backup.folder 'BLACK-code.zip') -CompressionLevel Optimal
    Write-Host ('암호화 데이터·환경 키·앱 코드 백업 완료: ' + $backup.folder)
} catch { Write-Error '자동 백업에 실패했습니다. 서버 PC에서 수동 백업을 실행하고 비공개 로그를 확인해 주세요.'; exit 1 }
