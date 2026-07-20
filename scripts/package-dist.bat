@echo off
setlocal
set "CHANNEL=%~1"
if "%CHANNEL%"=="" set "CHANNEL=beta"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package-dist.ps1" -Channel "%CHANNEL%"
exit /b %ERRORLEVEL%
