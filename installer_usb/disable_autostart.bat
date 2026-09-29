@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge — Disable Windows Startup Auto-Run

echo ========================================================================
echo   NEXUS 3D — Disable Windows Startup Auto-Run
echo ========================================================================
echo.

cd /d "%~dp0"

:: Detect Python executable
set "PYTHON_CMD="
if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    goto :RUN_DISABLE
)

python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
    goto :RUN_DISABLE
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :RUN_DISABLE
)

echo [ERROR] Python was not found in PATH or python_runtime folder.
pause
exit /b 1

:RUN_DISABLE
%PYTHON_CMD% bridge_daemon.py --uninstall-autostart
echo.
pause
exit /b 0
