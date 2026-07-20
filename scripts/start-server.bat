@echo off
setlocal
cd /d "%~dp0\.."

REM Prefer tray host if present (beta first, then release)
if exist "dist\Neuro Server Beta.exe" (
  start "" "dist\Neuro Server Beta.exe"
  goto :eof
)
if exist "dist\Neuro Server.exe" (
  start "" "dist\Neuro Server.exe"
  goto :eof
)

if not exist "server.toml" (
  copy /Y "configs\server.example.toml" "server.toml" >nul
)

if exist "dist\bin\neuro-server.exe" (
  set "BIN=dist\bin\neuro-server.exe"
) else if exist "dist\neuro-server.exe" (
  set "BIN=dist\neuro-server.exe"
) else if exist "target\release\neuro-server.exe" (
  set "BIN=target\release\neuro-server.exe"
) else if exist "target\debug\neuro-server.exe" (
  set "BIN=target\debug\neuro-server.exe"
) else (
  echo Building server...
  call "%~dp0build-server.bat"
  set "BIN=dist\bin\neuro-server.exe"
)

echo Starting Neuro Connect server core in this terminal (live logs)...
echo Binary: %BIN%
"%BIN%" server.toml
endlocal
