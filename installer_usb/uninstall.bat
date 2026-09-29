@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge — Daemon Uninstaller

echo ========================================================================
echo   NEXUS 3D — Bridge Daemon Uninstaller
echo ========================================================================
echo.

cd /d "%~dp0"

:: 1. Detect Python executable
set "PYTHON_CMD="
if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    goto :RUN_UNINSTALLER
)

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
    goto :RUN_UNINSTALLER
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :RUN_UNINSTALLER
)

:: 2. Fallback pure-batch uninstallation if Python is missing
echo [*] Running direct Windows cleanup...

:: Stop running processes
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Stopped PID:' $_.ProcessId }"

:: Remove startup launcher and Registry Run key
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Nexus3DBridge" /f >nul 2>&1
echo [OK] Removed Windows Registry startup entry.

set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nexus3DBridge.vbs"
if exist "%STARTUP_VBS%" (
    del /f /q "%STARTUP_VBS%"
    echo [OK] Removed Windows Startup launcher: %STARTUP_VBS%
) else (
    echo [OK] No Windows Startup launcher was present.
)

echo.
set /p "DEL_CONF=Delete config.env? (y/N): "
if /i "!DEL_CONF!"=="y" (
    if exist "config.env" del /f /q "config.env"
    echo [OK] Deleted config.env
)

set /p "DEL_LOG=Delete bridge.log? (y/N): "
if /i "!DEL_LOG!"=="y" (
    if exist "bridge.log" del /f /q "bridge.log"
    echo [OK] Deleted bridge.log
)

echo.
echo [OK] Uninstallation complete!
pause
exit /b 0

:RUN_UNINSTALLER
%PYTHON_CMD% uninstall_wizard.py
pause
exit /b 0
