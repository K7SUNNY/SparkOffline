@echo off
title SparkV2 Offline - Local AI
cd /d "%~dp0"

echo =======================================================
echo          SparkV2 Offline - Local AI Studio
echo            Model: Qwen3.5-2B-Q4_K_M.gguf
echo =======================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    python server.py
    exit /b 0
)

echo [INFO] Python not detected, launching with PowerShell runner...
powershell -ExecutionPolicy Bypass -File .\run.ps1
exit /b 0
