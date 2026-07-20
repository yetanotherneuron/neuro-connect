@echo off
setlocal
cd /d "%~dp0\.."

echo Building server + desktop + Android + AppImage (best effort)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-all.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" exit /b %ERR%
echo.
echo All builds complete.
endlocal
