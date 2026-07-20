param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta",
  [string]$ServerUrl = "",
  [switch]$SkipAndroid,
  [switch]$SkipLinux,
  [switch]$RequireCrossPlatform
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Invoke-Step([string]$Name, [scriptblock]$Action) {
  Write-Host ""
  Write-Host "======== $Name ========"
  & $Action
}

Invoke-Step "Server + Windows packaging" {
  & "$PSScriptRoot\build-server.bat"
  if ($LASTEXITCODE -ne 0) { throw "build-server failed" }
}

Invoke-Step "Desktop client (Windows NSIS/MSI)" {
  $args = @("-Channel", $Channel)
  if ($ServerUrl) { $args += @("-ServerUrl", $ServerUrl) }
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\build-client.ps1" @args
  if ($LASTEXITCODE -ne 0) { throw "build-client failed" }
}

$crossFailed = @()

if (-not $SkipAndroid) {
  try {
    Invoke-Step "Android APK" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\build-android.ps1" -Channel $Channel
      if ($LASTEXITCODE -ne 0) { throw "build-android failed" }
    }
  } catch {
    $crossFailed += "Android APK: $($_.Exception.Message)"
    Write-Host "WARNING: Android build failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "Install Android Studio / set ANDROID_HOME, or re-run with -SkipAndroid"
  }
} else {
  Write-Host "Skipping Android (-SkipAndroid)"
}

if (-not $SkipLinux) {
  try {
    Invoke-Step "Linux AppImage (WSL/Docker)" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\build-appimage.ps1" -Channel $Channel -ServerUrl $ServerUrl
      if ($LASTEXITCODE -ne 0) { throw "build-appimage failed" }
    }
  } catch {
    $crossFailed += "AppImage: $($_.Exception.Message)"
    Write-Host "WARNING: AppImage build failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "AppImage requires Linux, WSL, or Docker. Or run scripts/build-client.sh on Linux."
  }
} else {
  Write-Host "Skipping Linux AppImage (-SkipLinux)"
}

Write-Host ""
Write-Host "======== dist summary ========"
Get-ChildItem (Join-Path $root "dist") -File -ErrorAction SilentlyContinue |
  Sort-Object Name |
  ForEach-Object { "{0,-40} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB) }
Get-ChildItem (Join-Path $root "dist") -Directory -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host ("[{0}]" -f $_.Name)
    Get-ChildItem $_.FullName -File -Recurse -ErrorAction SilentlyContinue |
      ForEach-Object { "  {0,-38} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB) }
  }

if ($crossFailed.Count -gt 0) {
  $note = Join-Path $root "dist\CROSS_PLATFORM_MISSING.txt"
  @(
    "Neuro Connect build-all: some cross-platform artifacts were not produced on this machine.",
    "",
    $crossFailed
    "",
    "Android APK: install Android Studio, set ANDROID_HOME, then: scripts\build-android.bat",
    "  (build-android.ps1 can also bootstrap command-line tools into .tools\android-sdk)",
    "AppImage: build on Linux with ./scripts/build-client.sh, or enable WSL/Docker and re-run build-appimage.ps1",
    ""
  ) | Set-Content -Path $note -Encoding UTF8
  Write-Host "Wrote $note"

  if ($RequireCrossPlatform) {
    throw ("Cross-platform builds required but failed:`n" + ($crossFailed -join "`n"))
  }
}

Write-Host ""
Write-Host "All builds complete."
