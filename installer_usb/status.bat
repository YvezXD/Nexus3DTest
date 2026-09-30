@echo off
setlocal
cd /d "%~dp0"
echo ========================================================================
echo   NEXUS 3D Bridge — Process & Connection Status
echo ========================================================================
echo.

set "FOUND_PID="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    set "FOUND_PID=%%a"
)

if defined FOUND_PID (
    echo [STATUS] Bridge Daemon is RUNNING (Port 58921 active, PID: %FOUND_PID%)
) else (
    echo [STATUS] Bridge Daemon is NOT running.
)

echo.
echo Recent Bridge Log Entries (bridge.log):
echo ------------------------------------------------------------------------
if exist "bridge.log" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content bridge.log -Tail 15"
) else (
    echo (No log file generated yet)
)
echo ------------------------------------------------------------------------
echo.
pause
