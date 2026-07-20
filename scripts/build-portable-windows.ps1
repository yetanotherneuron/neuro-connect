# Package a portable Windows zip of the Tauri release exe
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ReleaseDir = Join-Path $Root "apps\desktop\src-tauri\target\release"
$Exe = Join-Path $ReleaseDir "neuro-connect.exe"
if (-not (Test-Path $Exe)) {
  Write-Error "Missing $Exe - run: cd apps/desktop; npm run tauri build"
}
$Out = Join-Path $Root "dist"
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$Stage = Join-Path $Out "NeuroConnect-Portable"
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
Copy-Item $Exe (Join-Path $Stage "Neuro Connect.exe")
Copy-Item (Join-Path $Root "configs\client.example.toml") $Stage
Copy-Item (Join-Path $Root "docs\INSTALL.md") $Stage
$Zip = Join-Path $Out "NeuroConnect-Portable-windows-x64.zip"
if (Test-Path $Zip) { Remove-Item $Zip }
Compress-Archive -Path "$Stage\*" -DestinationPath $Zip
Remove-Item -Recurse -Force $Stage
Write-Host "Wrote $Zip"
