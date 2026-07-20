@echo off
setlocal
cd /d "%~dp0\.."

REM Usage:
REM   build-client.bat
REM   build-client.bat beta
REM   build-client.bat release https://your-vps.example.com

set "CHANNEL=%~1"
if "%CHANNEL%"=="" set "CHANNEL=beta"
set "SERVERURL=%~2"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-client.ps1" -Channel "%CHANNEL%" -ServerUrl "%SERVERURL%"
exit /b %ERRORLEVEL%
