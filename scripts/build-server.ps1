# Build neuro-server release zip for Windows
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
cargo build -p neuro-server --release
$Out = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Stage = Join-Path $Out "neuro-server-windows"
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
Copy-Item "$Root\target\release\neuro-server.exe" $Stage
Copy-Item "$Root\configs\server.example.toml" $Stage
Copy-Item "$Root\docs\SERVER_SETUP.md" $Stage
$Zip = Join-Path $Out "neuro-server-windows-x64.zip"
if (Test-Path $Zip) { Remove-Item $Zip }
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip
Remove-Item -Recurse -Force $Stage
Write-Host "Wrote $Zip"
