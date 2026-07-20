@echo off
setlocal
cd /d "%~dp0\.."

echo Stopping any running server so binaries can be replaced...
call "%~dp0stop-server.bat"

echo Building neuro-server + neuro-host (release)...
cargo build -p neuro-server -p neuro-host --release
if errorlevel 1 exit /b 1

call "%~dp0package-dist.bat"
endlocal
