param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta",
  [string]$ServerUrl = "",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ($Channel -eq "release" -and [string]::IsNullOrWhiteSpace($ServerUrl)) {
  throw "Release builds require -ServerUrl (e.g. https://chat.example.com)"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $pkgPath = Join-Path $root "apps\desktop\package.json"
  $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
  $Version = [string]$pkg.version
  if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Could not determine app version from apps/desktop/package.json"
  }
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

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

# Cargo workspace puts release artifacts in <repo>/target/release (not apps/desktop/src-tauri/target).
function Resolve-ReleaseDir {
  $candidates = @(
    (Join-Path $root "target\release"),
    (Join-Path $root "apps\desktop\src-tauri\target\release")
  )
  foreach ($c in $candidates) {
    if (Test-Path (Join-Path $c "neuro-connect.exe")) { return $c }
    if (Test-Path (Join-Path $c "bundle")) { return $c }
  }
  return $candidates[0]
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
  # On Windows only emit Windows installers (AppImage/deb/rpm/dmg need Linux/macOS hosts).
  if ($IsWindows -or $env:OS -match "Windows") {
    $json.bundle.targets = @("nsis", "msi")
  }
  Write-Utf8NoBom $tauriConf (($json | ConvertTo-Json -Depth 20) + "`n")

  Write-Host "Building $productName (channel=$Channel, version=$Version)..."
  Push-Location (Join-Path $root "apps\desktop")
  npm install
  npm run tauri build
  if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit $LASTEXITCODE" }
  Pop-Location

  $dist = Join-Path $root "dist"
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  $rel = Resolve-ReleaseDir
  Write-Host "Using release dir: $rel"

  $exeName = if ($Channel -eq "release") { "Neuro Connect.exe" } else { "Neuro Connect Beta.exe" }
  $setupName = if ($Channel -eq "release") { "Neuro Connect Setup.exe" } else { "Neuro Connect Beta Setup.exe" }
  $msiName = if ($Channel -eq "release") { "Neuro Connect.msi" } else { "Neuro Connect Beta.msi" }

  $copied = @()
  $exeSrc = Join-Path $rel "neuro-connect.exe"
  if (Test-Path $exeSrc) {
    Copy-Item $exeSrc (Join-Path $dist $exeName) -Force
    $copied += $exeName
  }

  $nsis = Get-ChildItem (Join-Path $rel "bundle\nsis\*.exe") -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($nsis) {
    Copy-Item $nsis.FullName (Join-Path $dist $setupName) -Force
    $copied += $setupName
  }

  $msi = Get-ChildItem (Join-Path $rel "bundle\msi\*.msi") -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($msi) {
    Copy-Item $msi.FullName (Join-Path $dist $msiName) -Force
    $copied += $msiName
  }

  if ($copied.Count -eq 0) {
    throw "Client build succeeded but no artifacts found under $rel (expected neuro-connect.exe / bundle\nsis / bundle\msi)."
  }

  Write-Host "Done. Copied to dist\: $($copied -join ', ')"
  Write-Host "Note: AppImage/deb/rpm require Linux (scripts/build-client.sh). APK requires: npm run build:android"
}
finally {
  if (Test-Path $backup) {
    Move-Item $backup $tauriConf -Force
  }
}
