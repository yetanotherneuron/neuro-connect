@echo off
setlocal
cd /d "%~dp0\.."

echo Stopping Neuro Connect server / tray host...
taskkill /IM "Neuro Server.exe" /F >nul 2>&1
taskkill /IM neuro-host.exe /F >nul 2>&1
taskkill /IM neuro-server.exe /F >nul 2>&1

for /f "tokens=5" %%p in ('netstat -ano -p tcp ^| findstr ":7420" ^| findstr "LISTENING"') do (
  echo Killing PID %%p on port 7420...
  taskkill /PID %%p /F >nul 2>&1
)

echo Done.
endlocal
