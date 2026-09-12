param (
    [int]$Port = 5000,
    [int]$ContextSize = 2048,
    [switch]$ForceCpu,
    [string]$Model = "models\Qwen3.5-2B-Q4_K_M.gguf"
)

$Host.UI.RawUI.WindowTitle = "SparkV2 Offline - Qwen 3.5"
$WorkspaceRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $WorkspaceRoot

Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "         SparkV2 Offline - Local AI Studio             " -ForegroundColor White
Write-Host "          Model: $Model                                " -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Cyan

if (-not (Test-Path $Model)) {
    Write-Host "[ERROR] Model file not found at $Model!" -ForegroundColor Red
    Read-Host "Press Enter to exit..."
    exit 1
}

$ServerExe = "bin\llama-vulkan\llama-server.exe"
if ($ForceCpu -or -not (Test-Path $ServerExe)) {
    $ServerExe = "bin\llama\llama-server.exe"
    Write-Host "[INFO] Using Universal CPU Engine" -ForegroundColor Yellow
} else {
    Write-Host "[INFO] Using Vulkan GPU Acceleration Engine" -ForegroundColor Green
}

Write-Host "[INFO] Serving web app on http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host "[INFO] Opening browser..." -ForegroundColor Cyan
Start-Process "http://localhost:$Port/index.html"

Write-Host "`nServer is running! Press Ctrl+C to stop.`n" -ForegroundColor Gray

& $ServerExe -m $Model --path . --port $Port --host 127.0.0.1 -c $ContextSize
