param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta",
  [string]$ServerUrl = "",
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Channel -eq "release" -and [string]::IsNullOrWhiteSpace($ServerUrl)) {
  throw "Release builds require -ServerUrl (e.g. https://chat.example.com)"
}

$env:NEURO_CHANNEL = $Channel
$env:NEURO_SERVER_URL = $ServerUrl
$env:NEURO_APP_VERSION = $Version

$productName = if ($Channel -eq "release") { "Neuro Connect" } else { "Neuro Connect Beta" }
$identifier = if ($Channel -eq "release") {
  "com.yetanotherneuron.neuroconnect"
} else {
  "com.yetanotherneuron.neuroconnect.beta"
}

$tauriConf = Join-Path $root "apps\desktop\src-tauri\tauri.conf.json"
$backup = "$tauriConf.bak"
Copy-Item $tauriConf $backup -Force
try {
  $json = Get-Content $tauriConf -Raw | ConvertFrom-Json
  $json.productName = $productName
  $json.identifier = $identifier
  $json.version = $Version
  $json.app.windows[0].title = $productName
  ($json | ConvertTo-Json -Depth 20) | Set-Content $tauriConf -Encoding UTF8

  Write-Host "Building $productName (channel=$Channel)..."
  Push-Location (Join-Path $root "apps\desktop")
  npm install
  npm run tauri build
  Pop-Location

  $dist = Join-Path $root "dist"
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $rel = Join-Path $root "apps\desktop\src-tauri\target\release"
  $exeName = if ($Channel -eq "release") { "Neuro Connect.exe" } else { "Neuro Connect Beta.exe" }
  $setupName = if ($Channel -eq "release") { "Neuro Connect Setup.exe" } else { "Neuro Connect Beta Setup.exe" }
  $msiName = if ($Channel -eq "release") { "Neuro Connect.msi" } else { "Neuro Connect Beta.msi" }

  if (Test-Path (Join-Path $rel "neuro-connect.exe")) {
    Copy-Item (Join-Path $rel "neuro-connect.exe") (Join-Path $dist $exeName) -Force
  }

  $nsis = Get-ChildItem (Join-Path $rel "bundle\nsis\*.exe") -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nsis) { Copy-Item $nsis.FullName (Join-Path $dist $setupName) -Force }

  $msi = Get-ChildItem (Join-Path $rel "bundle\msi\*.msi") -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($msi) { Copy-Item $msi.FullName (Join-Path $dist $msiName) -Force }

  Write-Host "Done. Artifacts in dist\: $exeName, $setupName, $msiName"
}
finally {
  if (Test-Path $backup) {
    Move-Item $backup $tauriConf -Force
  }
}
