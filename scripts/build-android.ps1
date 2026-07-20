param(
  [ValidateSet("beta", "release")]
  [string]$Channel = "beta",
  [string]$Version = "",
  [switch]$DebugApk
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if ([string]::IsNullOrWhiteSpace($Version)) {
  $pkg = Get-Content (Join-Path $root "apps\desktop\package.json") -Raw | ConvertFrom-Json
  $Version = [string]$pkg.version
}

$dist = Join-Path $root "dist"
$androidDist = Join-Path $dist "android"
New-Item -ItemType Directory -Force -Path $androidDist | Out-Null

function Find-AndroidSdk {
  $candidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    (Join-Path $root ".tools\android-sdk"),
    (Join-Path $env:LOCALAPPDATA "Android\Sdk"),
    "C:\Android\Sdk"
  ) | Where-Object { $_ -and (Test-Path $_) }
  foreach ($c in $candidates) {
    if ((Test-Path (Join-Path $c "platform-tools")) -or (Test-Path (Join-Path $c "cmdline-tools"))) {
      return (Resolve-Path $c).Path
    }
  }
  return $null
}

function Ensure-AndroidSdk {
  $sdk = Find-AndroidSdk
  if ($sdk) { return $sdk }

  Write-Host "Android SDK not found. Bootstrapping command-line tools into .tools\android-sdk ..."
  $sdkRoot = Join-Path $root ".tools\android-sdk"
  $toolsZip = Join-Path $root ".tools\cmdline-tools.zip"
  $toolsUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  New-Item -ItemType Directory -Force -Path (Join-Path $root ".tools") | Out-Null

  if (-not (Test-Path $toolsZip)) {
    Write-Host "Downloading Android command-line tools..."
    Invoke-WebRequest -Uri $toolsUrl -OutFile $toolsZip -UseBasicParsing
  }

  $extract = Join-Path $root ".tools\cmdline-tools-extract"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $toolsZip -DestinationPath $extract -Force

  $latest = Join-Path $sdkRoot "cmdline-tools\latest"
  New-Item -ItemType Directory -Force -Path $latest | Out-Null
  # Zip contains a top-level cmdline-tools/ folder
  $inner = Get-ChildItem $extract -Directory | Select-Object -First 1
  Copy-Item (Join-Path $inner.FullName "*") $latest -Recurse -Force

  $sdkmanager = Join-Path $latest "bin\sdkmanager.bat"
  if (-not (Test-Path $sdkmanager)) {
    throw "sdkmanager.bat missing after extract"
  }

  $env:ANDROID_HOME = $sdkRoot
  $env:ANDROID_SDK_ROOT = $sdkRoot
  $packages = @(
    "platform-tools",
    "platforms;android-35",
    "build-tools;35.0.0"
  )
  Write-Host "Installing SDK packages (this can take several minutes)..."
  $yes = "y`n" * 80
  $yes | & $sdkmanager --sdk_root=$sdkRoot --licenses | Out-Null
  & $sdkmanager --sdk_root=$sdkRoot $packages
  if ($LASTEXITCODE -ne 0) { throw "sdkmanager failed" }

  return $sdkRoot
}

Write-Host "=== Building Android APK (channel=$Channel, version=$Version) ==="

# 1) Web client + Capacitor sync
Push-Location (Join-Path $root "web")
npm install
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "web build failed" }
npx cap sync android
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "cap sync failed" }
Pop-Location

# 2) SDK
$sdk = Ensure-AndroidSdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
Write-Host "Using Android SDK: $sdk"

$localProps = Join-Path $root "web\android\local.properties"
$sdkSlash = $sdk -replace '\\', '/'
Set-Content -Path $localProps -Value "sdk.dir=$sdkSlash" -Encoding ASCII

# Align versionName with app version
$appGradle = Join-Path $root "web\android\app\build.gradle"
$gradleText = Get-Content $appGradle -Raw
$gradleText = $gradleText -replace 'versionName\s+"[^"]+"', ("versionName `"$Version`"")
$maj = 0; $min = 0; $pat = 0
$parts = $Version.Split('.')
if ($parts.Length -gt 0) { [void][int]::TryParse(($parts[0] -replace '\D',''), [ref]$maj) }
if ($parts.Length -gt 1) { [void][int]::TryParse(($parts[1] -replace '\D',''), [ref]$min) }
if ($parts.Length -gt 2) { [void][int]::TryParse(($parts[2] -replace '\D',''), [ref]$pat) }
$code = [Math]::Max(1, ($maj * 10000) + ($min * 100) + $pat)
$gradleText = $gradleText -replace 'versionCode\s+\d+', "versionCode $code"
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($appGradle, $gradleText, $utf8)

# 3) Gradle
$androidDir = Join-Path $root "web\android"
$gradlew = Join-Path $androidDir "gradlew.bat"
$task = if ($DebugApk) { "assembleDebug" } else { "assembleRelease" }
# Prefer debug if no release signing configured
if (-not $DebugApk) {
  Write-Host "Building release APK (unsigned). Use -DebugApk for debug."
}

Push-Location $androidDir
& $gradlew $task --no-daemon
$gradleExit = $LASTEXITCODE
Pop-Location
if ($gradleExit -ne 0) {
  if (-not $DebugApk) {
    Write-Host "Release assemble failed; retrying assembleDebug..."
    Push-Location $androidDir
    & $gradlew assembleDebug --no-daemon
    $gradleExit = $LASTEXITCODE
    Pop-Location
    $DebugApk = $true
  }
}
if ($gradleExit -ne 0) { throw "Gradle build failed" }

# 4) Copy APK
$apkName = if ($Channel -eq "release") { "Neuro-Connect-$Version.apk" } else { "Neuro-Connect-Beta-$Version.apk" }
$searchRoots = @(
  (Join-Path $androidDir "app\build\outputs\apk\release"),
  (Join-Path $androidDir "app\build\outputs\apk\debug")
)
$apk = $null
foreach ($r in $searchRoots) {
  if (Test-Path $r) {
    $apk = Get-ChildItem $r -Filter *.apk -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($apk) { break }
  }
}
if (-not $apk) { throw "APK not found under web/android/app/build/outputs" }

$dest = Join-Path $androidDist $apkName
Copy-Item $apk.FullName $dest -Force
Copy-Item $apk.FullName (Join-Path $dist $apkName) -Force
Write-Host "APK ready: $dest"
Write-Host "Also copied to: $(Join-Path $dist $apkName)"
