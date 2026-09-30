@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge v2.1 — Daemon Uninstaller
cd /d "%~dp0"

:: 1. Detect Python executable
set "PYTHON_CMD="
if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    goto :RUN_PYTHON_UNINSTALLER
)

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
    goto :RUN_PYTHON_UNINSTALLER
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :RUN_PYTHON_UNINSTALLER
)

:: 2. Fallback pure-batch uninstallation if Python is missing
echo ========================================================================
echo   NEXUS 3D — Bridge Daemon Uninstaller v2.1 (Direct Mode)
echo ========================================================================
echo.

set /p "CONFIRM=Are you sure you want to stop and uninstall the NEXUS 3D bridge? (Y/n): "
if /i not "%CONFIRM%"=="" if /i not "%CONFIRM%"=="y" (
    echo Uninstallation cancelled.
    pause
    exit /b 0
)

echo [*] Stopping running bridge daemon...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
    echo [OK] Stopped Bridge process (PID %%a)
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' };" ^
    "if ($procs) { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Stopped PID:' $p.ProcessId } }"

echo [*] Removing Windows Registry startup entry...
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v "Nexus3DBridge" /f >nul 2>&1

set "STARTUP_VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Nexus3DBridge.vbs"
if exist "%STARTUP_VBS%" (
    del /f /q "%STARTUP_VBS%"
    echo [OK] Removed Windows Startup launcher: %STARTUP_VBS%
)

echo.
set /p "DEL_CONF=Delete configuration file (config.env)? (y/N): "
if /i "!DEL_CONF!"=="y" (
    if exist "config.env" del /f /q "config.env"
    echo [OK] Deleted config.env
)

set /p "DEL_LOG=Delete bridge log file (bridge.log)? (y/N): "
if /i "!DEL_LOG!"=="y" (
    if exist "bridge.log" del /f /q "bridge.log"
    echo [OK] Deleted bridge.log
)

if exist "python_runtime" (
    set /p "DEL_PY=Delete downloaded portable Python runtime (python_runtime)? (y/N): "
    if /i "!DEL_PY!"=="y" (
        rmdir /s /q "python_runtime"
        echo [OK] Deleted python_runtime
    )
)

echo.
echo ========================================================================
echo   [OK] Uninstallation complete!
echo ========================================================================
pause
exit /b 0

:RUN_PYTHON_UNINSTALLER
if exist "uninstaller.py" (
    %PYTHON_CMD% uninstaller.py %*
) else (
    echo [ERROR] uninstaller.py not found in %~dp0
    pause
    exit /b 1
)
set "EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %EXIT_CODE%
