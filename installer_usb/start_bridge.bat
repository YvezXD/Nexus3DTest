@echo off
setlocal
cd /d "%~dp0"

echo [*] Starting NEXUS 3D Bridge Daemon...

:: Stop any old daemon first to prevent port conflict
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

set "PYTHON_BIN=python"
if exist "python_runtime\python.exe" set "PYTHON_BIN=python_runtime\python.exe"

set "PYTHONW_BIN=pythonw"
if exist "python_runtime\pythonw.exe" set "PYTHONW_BIN=python_runtime\pythonw.exe"

start "" "%PYTHONW_BIN%" bridge_daemon.py 2>nul
if %ERRORLEVEL% neq 0 (
    start "" "%PYTHON_BIN%" bridge_daemon.py
)

echo [OK] Bridge daemon launched in background!
echo Run 'status.bat' to view live status.
timeout /t 3 >nul
