param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta",
  [string]$ServerUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$dist = Join-Path $root "dist"
$linuxDist = Join-Path $dist "linux"
New-Item -ItemType Directory -Force -Path $linuxDist | Out-Null

$env:NEURO_CHANNEL = $Channel
$env:NEURO_SERVER_URL = $ServerUrl

function Test-WslReady {
  try {
    $out = & wsl -e echo ok 2>&1 | Out-String
    return ($out -match "ok")
  } catch {
    return $false
  }
}

function Test-DockerReady {
  try {
    & docker version 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

Write-Host "=== Building Linux AppImage (channel=$Channel) ==="

# Already on Linux (Git Bash / native)
if ($env:OS -notmatch "Windows" -or $IsLinux) {
  & bash "$PSScriptRoot/build-client.sh"
  if ($LASTEXITCODE -ne 0) { throw "build-client.sh failed" }
  exit 0
}

$wslOk = Test-WslReady
if ($wslOk) {
  Write-Host "Using WSL to build AppImage..."
  $wslPath = (& wsl wslpath -a $root 2>$null)
  if (-not $wslPath) { $wslPath = "/mnt/" + ($root.Substring(0,1).ToLower()) + ($root.Substring(2) -replace '\\','/') }
  $cmd = "cd '$wslPath' && export NEURO_CHANNEL='$Channel' NEURO_SERVER_URL='$ServerUrl' && bash ./scripts/build-client.sh"
  & wsl -e bash -lc $cmd
  if ($LASTEXITCODE -ne 0) { throw "WSL AppImage build failed" }
  Write-Host "AppImage build via WSL finished (see dist/)."
  exit 0
}

if (Test-DockerReady) {
  Write-Host "Using Docker to build AppImage..."
  # Generic Rust builder image; user may need a fuller Tauri Linux image for deps.
  $vol = "${root}:/src"
  $dockerCmd = @(
    "run", "--rm", "-v", $vol, "-w", "/src",
    "-e", "NEURO_CHANNEL=$Channel",
    "-e", "NEURO_SERVER_URL=$ServerUrl",
    "ghcr.io/tauri-apps/tauri-docker:latest",
    "bash", "./scripts/build-client.sh"
  )
  & docker @dockerCmd
  if ($LASTEXITCODE -ne 0) {
    throw "Docker AppImage build failed (install Linux build deps or use a Tauri-ready image)."
  }
  Write-Host "AppImage build via Docker finished (see dist/)."
  exit 0
}

throw @"
Cannot build AppImage on this Windows host: WSL is not installed and Docker was not found.

Install one of:
  - WSL2 + Ubuntu, then: wsl --install
  - Docker Desktop
  - Or build on a Linux machine: ./scripts/build-client.sh

Windows build-all still produces NSIS/MSI/portable under dist\.
"@
