@echo off
title SparkV2 Offline - Local AI
cd /d "%~dp0"

echo =======================================================
echo          SparkV2 Offline - Local AI Studio
echo            Model: Qwen3.5-2B-Q4_K_M.gguf
echo =======================================================
echo.

set MODEL_PATH=models\Qwen3.5-2B-Q4_K_M.gguf
set PORT=5000

if not exist "%MODEL_PATH%" (
    echo [ERROR] Model file not found at %MODEL_PATH%!
    pause
    exit /b 1
)

:: Select Vulkan GPU engine if available, else CPU
if exist "bin\llama-vulkan\llama-server.exe" (
    echo [INFO] Starting engine with Vulkan GPU Acceleration...
    set SERVER_EXE=bin\llama-vulkan\llama-server.exe
) else (
    echo [INFO] Starting engine with Universal CPU Engine...
    set SERVER_EXE=bin\llama\llama-server.exe
)

echo [INFO] Serving web app on http://127.0.0.1:%PORT%
echo [INFO] Launching browser...
start "" http://localhost:%PORT%/index.html

echo.
echo Server is running! Keep this window open. Press Ctrl+C to exit.
echo.

"%SERVER_EXE%" -m "%MODEL_PATH%" --path . --port %PORT% --host 127.0.0.1 -c 2048

pause
