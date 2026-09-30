@echo off
setlocal enabledelayedexpansion
title NEXUS 3D Bridge v2.1 — Installer and Setup Wizard
cd /d "%~dp0"

echo ========================================================================
echo   NEXUS 3D — Fleet Telemetry Bridge Installer v2.1
echo   [Low-Bandwidth Adaptive Engine + Bidirectional Command Relay]
echo ========================================================================
echo.

:: 1. Detect Python executable
set "PYTHON_CMD="
if exist "python_runtime\python.exe" (
    set "PYTHON_CMD=python_runtime\python.exe"
    goto :PYTHON_READY
)
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

:: 2. Auto-download portable Python if missing
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
    "Remove-Item $zip -Force;" ^
    "$pth = Get-Item 'python_runtime\python*._pth' -ErrorAction SilentlyContinue;" ^
    "if ($pth) { Add-Content $pth.FullName '..'; Add-Content $pth.FullName 'import site' }"

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
:: 3. Run Setup Wizard
if exist "setup_wizard.py" (
    %PYTHON_CMD% setup_wizard.py %*
) else (
    echo [ERROR] setup_wizard.py not found in %~dp0
    pause
    exit /b 1
)

set "EXIT_CODE=%ERRORLEVEL%"
if %EXIT_CODE% neq 0 (
    echo.
    echo [!] Setup exited with code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%
