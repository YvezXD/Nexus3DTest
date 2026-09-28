@echo off
setlocal
echo [*] Stopping NEXUS 3D Bridge Daemon...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Stopped PID:' $_.ProcessId }"

echo [OK] Bridge processes stopped.
pause
