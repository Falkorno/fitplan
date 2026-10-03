$ErrorActionPreference = 'Continue'
$projectPath = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $projectPath 'stride-server.log'

Set-Location -LiteralPath $projectPath

while ($true) {
    "$(Get-Date -Format o) Starting Stride" | Out-File -FilePath $logPath -Append -Encoding utf8
    & npm.cmd run start *>> $logPath
    "$(Get-Date -Format o) Stride stopped; restarting in 5 seconds" | Out-File -FilePath $logPath -Append -Encoding utf8
    Start-Sleep -Seconds 5
}
