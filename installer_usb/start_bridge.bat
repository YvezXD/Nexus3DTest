@echo off
setlocal
title NEXUS 3D Bridge v2.1 — Start Daemon
cd /d "%~dp0"

echo [*] Starting NEXUS 3D Bridge Daemon v2.1 (Low-Bandwidth Engine)...

:: Stop any old daemon first to prevent port conflict
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":58921" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

set "PYTHON_BIN=python"
if exist "python_runtime\python.exe" set "PYTHON_BIN=python_runtime\python.exe"

set "PYTHONW_BIN=pythonw"
if exist "python_runtime\pythonw.exe" set "PYTHONW_BIN=python_runtime\pythonw.exe"

start "" "%PYTHONW_BIN%" bridge_daemon.py >nul 2>&1
if %ERRORLEVEL% neq 0 (
    start "" "%PYTHON_BIN%" bridge_daemon.py >nul 2>&1
)

echo [OK] Bridge daemon launched in background!
ping -n 3 127.0.0.1 >nul
