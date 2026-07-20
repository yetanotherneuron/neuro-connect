@echo off
setlocal
cd /d "%~dp0\.."
if exist "dist\Neuro Connect Beta.exe" (
  start "" "dist\Neuro Connect Beta.exe"
  goto :eof
)
if exist "dist\Neuro Connect.exe" (
  start "" "dist\Neuro Connect.exe"
  goto :eof
)
echo Desktop exe not found. Run scripts\build-client.bat then scripts\package-dist.bat
pause
endlocal
