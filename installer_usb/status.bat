@echo off
setlocal
cd /d "%~dp0"
echo ========================================================================
echo   NEXUS 3D Bridge — Process & Connection Status
echo ========================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$procs = Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' };" ^
    "if ($procs) {" ^
    "  Write-Host '[STATUS] Bridge Daemon is RUNNING (PID:' ($procs.ProcessId -join ', ') ')' -ForegroundColor Green;" ^
    "} else {" ^
    "  Write-Host '[STATUS] Bridge Daemon is NOT running.' -ForegroundColor Red;" ^
    "}"

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
