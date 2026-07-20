param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== Packaging dist\ for Windows (channel=$Channel) ==="
& "$PSScriptRoot\stop-server.bat" 2>$null

cargo build -p neuro-server -p neuro-host --release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dist = Join-Path $root "dist"
New-Item -ItemType Directory -Force -Path (Join-Path $dist "bin") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dist "linux") | Out-Null

$rel = Join-Path $root "target\release"
Copy-Item (Join-Path $rel "neuro-server.exe") (Join-Path $dist "bin\neuro-server.exe") -Force

$serverName = if ($Channel -eq "release") { "Neuro Server.exe" } else { "Neuro Server Beta.exe" }
Copy-Item (Join-Path $rel "neuro-host.exe") (Join-Path $dist $serverName) -Force

$clientName = if ($Channel -eq "release") { "Neuro Connect.exe" } else { "Neuro Connect Beta.exe" }
$clientSrc = Join-Path $root "apps\desktop\src-tauri\target\release\neuro-connect.exe"
if (Test-Path (Join-Path $dist $clientName)) {
  Write-Host "Client portable already present: $clientName"
} elseif (Test-Path $clientSrc) {
  Copy-Item $clientSrc (Join-Path $dist $clientName) -Force
}

if (-not (Test-Path (Join-Path $dist "server.toml"))) {
  Copy-Item (Join-Path $root "configs\server.example.toml") (Join-Path $dist "server.toml") -Force
}
Copy-Item (Join-Path $root "apps\desktop\src-tauri\icons\icon.png") (Join-Path $dist "icon.png") -Force
Copy-Item (Join-Path $root "apps\desktop\src-tauri\icons\icon.ico") (Join-Path $dist "icon.ico") -Force -ErrorAction SilentlyContinue

Copy-Item (Join-Path $root "scripts\start-server.sh") (Join-Path $dist "linux\") -Force
Copy-Item (Join-Path $root "scripts\stop-server.sh") (Join-Path $dist "linux\") -Force
Copy-Item (Join-Path $root "scripts\neuro-connect.sh") (Join-Path $dist "linux\") -Force
Copy-Item (Join-Path $root "scripts\start-client.sh") (Join-Path $dist "linux\") -Force
if (Test-Path (Join-Path $root "docs\LINUX_DIST.md")) {
  Copy-Item (Join-Path $root "docs\LINUX_DIST.md") (Join-Path $dist "linux\README.md") -Force
}

Write-Host ""
Write-Host "dist\ ready. Server: $serverName  Client: $clientName"
