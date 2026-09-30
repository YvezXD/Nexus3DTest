@echo off
setlocal
echo [*] Stopping NEXUS 3D Bridge Daemon...

set "STOPPED_COUNT=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    if not errorlevel 1 (
        echo [OK] Stopped Bridge process (PID %%a)
        set /a STOPPED_COUNT+=1
    )
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' };" ^
    "if ($procs) { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Stopped PID:' $p.ProcessId } }"

if %STOPPED_COUNT% equ 0 (
    echo [INFO] No running bridge daemon was detected on port 58921.
) else (
    echo [OK] Bridge daemon stopped successfully.
)
pause
