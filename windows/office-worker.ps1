param([Parameter(Mandatory=$true)][string]$AppPath,[Parameter(Mandatory=$true)][string]$PipeName)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'office-common.ps1')
$pipe = New-Object IO.Pipes.NamedPipeClientStream('.', $PipeName, [IO.Pipes.PipeDirection]::InOut)
try {
    $pipe.Connect(30000)
    $reader = New-Object IO.StreamReader($pipe)
    $writer = New-Object IO.StreamWriter($pipe)
    $writer.AutoFlush = $true
    try {
        if (Test-BlackAdministrator) { throw 'DB 작업이 관리자 권한으로 실행되어 중단했습니다.' }
        $request = $reader.ReadLine() | ConvertFrom-Json
        $node = Get-BlackNode
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = $node
        $info.WorkingDirectory = $AppPath
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardInput = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
        $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
        if ($request.job -eq 'accounts') {
            $info.Arguments = '"' + (Join-Path $AppPath 'scripts\setup-office-accounts.mjs') + '"'
        } elseif ($request.job -eq 'backup') {
            $info.Arguments = '"' + (Join-Path $AppPath 'scripts\backup.mjs') + '" --output "' + $request.outputDirectory + '" --json'
        } elseif ($request.job -eq 'office-backup') {
            $info.FileName = 'powershell.exe'
            $info.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $AppPath 'windows\office-backup.ps1') + '"'
        } else { throw '허용되지 않은 DB 작업입니다.' }
        $process = New-Object Diagnostics.Process
        $process.StartInfo = $info
        if (-not $process.Start()) { throw 'DB 작업을 시작하지 못했습니다.' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if ($request.job -eq 'accounts') {
            $process.StandardInput.WriteLine((@{password=$request.password} | ConvertTo-Json -Compress))
            $request.password = $null
        }
        $process.StandardInput.Close()
        $process.WaitForExit()
        $result = @{exitCode=$process.ExitCode;output=$stdout.Result;error=$stderr.Result}
    } catch { $result = @{exitCode=1;output='';error=$_.Exception.Message} }
    $writer.WriteLine(($result | ConvertTo-Json -Compress))
} finally { $pipe.Dispose() }
