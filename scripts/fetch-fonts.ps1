# Download bundled fonts into assets/fonts and apps/desktop/public/fonts
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$FontDir = Join-Path $Root "assets\fonts"
$Public = Join-Path $Root "apps\desktop\public\fonts"
New-Item -ItemType Directory -Force -Path $FontDir, $Public | Out-Null

$outfitUrl = "https://github.com/google/fonts/raw/main/ofl/outfit/Outfit%5Bwght%5D.ttf"
$monoUrl = "https://github.com/google/fonts/raw/main/ofl/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf"

$outfit = Join-Path $FontDir "Outfit-Variable.ttf"
$mono = Join-Path $FontDir "JetBrainsMono-Regular.ttf"

Write-Host "Downloading Outfit…"
Invoke-WebRequest -Uri $outfitUrl -OutFile $outfit -UseBasicParsing
Write-Host "Downloading JetBrains Mono…"
Invoke-WebRequest -Uri $monoUrl -OutFile $mono -UseBasicParsing

Copy-Item $outfit, $mono $Public -Force
Write-Host "Fonts ready in assets/fonts and apps/desktop/public/fonts"
