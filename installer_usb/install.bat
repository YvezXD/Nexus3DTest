@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge — Installer & Setup Wizard

echo ========================================================================
echo   NEXUS 3D — Fleet Telemetry Bridge Installer
echo ========================================================================
echo.

cd /d "%~dp0"

:: 1. Check if Python 3 is available in PATH
set "PYTHON_CMD="
python --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=python"
    goto :PYTHON_READY
)

py -3 --version >nul 2>&1
if %ERRORLEVEL% equ 0 (
    set "PYTHON_CMD=py -3"
    goto :PYTHON_READY
)

:: 2. Check if local portable runtime exists
if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    goto :PYTHON_READY
)

:: 3. Automatically download portable Python runtime if missing (Zero manual steps required!)
echo [!] Python 3 was not detected on this system.
echo [*] Automatically downloading portable Python runtime (no installation required)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference = 'SilentlyContinue';" ^
    "$url = 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip';" ^
    "$zip = 'python_embed.zip';" ^
    "Write-Host 'Downloading portable Python...';" ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12;" ^
    "(New-Object System.Net.WebClient).DownloadFile($url, $zip);" ^
    "Write-Host 'Extracting portable runtime...';" ^
    "Expand-Archive -Path $zip -DestinationPath 'python_runtime' -Force;" ^
    "Remove-Item $zip -Force;"

if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    echo [OK] Portable Python runtime downloaded and ready!
    echo.
    goto :PYTHON_READY
) else (
    echo.
    echo [ERROR] Could not automatically download Python runtime.
    echo Please install Python 3.8+ from https://www.python.org and run install.bat again.
    pause
    exit /b 1
)

:PYTHON_READY
:: 4. Launch interactive setup wizard
echo [*] Launching Setup Wizard...
echo.
%PYTHON_CMD% setup_wizard.py

echo.
pause
