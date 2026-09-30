@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge v2.1 — Process and Fleet Status
cd /d "%~dp0"
echo ========================================================================
echo   NEXUS 3D Bridge v2.1 — Process and Fleet Status
echo ========================================================================
echo.

set "FOUND_PID="
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    set "FOUND_PID=%%a"
)

if "!FOUND_PID!"=="" (
    echo [STATUS] Bridge Daemon is NOT running.
) else (
    echo [STATUS] Bridge Daemon is RUNNING [Port 58921 active, PID: !FOUND_PID!]
)
echo.

echo Local Fleet Connectivity:
echo ------------------------------------------------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "function Check-Port($ip, $port) { try { $s = New-Object System.Net.Sockets.TcpClient; $c = $s.BeginConnect($ip, $port, $null, $null); $ok = $c.AsyncWaitHandle.WaitOne(500, $false); if ($ok) { $s.EndConnect($c); $s.Close(); return $true } } catch {} return $false };" ^
    "$p1 = Check-Port '192.168.1.124' 7125;" ^
    "$p2 = Check-Port '192.168.1.36' 7125;" ^
    "Write-Host '  Printer 1 (QIDI Q2 @ 192.168.1.124:7125)        : ' -NoNewline; if ($p1) { Write-Host 'ONLINE / READY' -ForegroundColor Green } else { Write-Host 'OFFLINE / UNREACHABLE' -ForegroundColor Yellow };" ^
    "Write-Host '  Printer 2 (FLASHFORGE AD5X @ 192.168.1.36:7125) : ' -NoNewline; if ($p2) { Write-Host 'ONLINE / READY' -ForegroundColor Green } else { Write-Host 'OFFLINE / STANDBY' -ForegroundColor Yellow };"
echo ------------------------------------------------------------------------
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
