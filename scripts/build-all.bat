@echo off
setlocal
cd /d "%~dp0\.."

echo Building server + desktop client...
call "%~dp0build-server.bat"
if errorlevel 1 exit /b 1
call "%~dp0build-client.bat"
if errorlevel 1 exit /b 1
echo.
echo All builds complete.
endlocal
