@echo off
setlocal
cd /d "%~dp0\.."

echo Starting desktop client in DEV mode (needs Node + Rust)...
echo Tip: run scripts\start-server.bat in another terminal first.
cd apps\desktop
call npm install
call npm run tauri dev
endlocal
