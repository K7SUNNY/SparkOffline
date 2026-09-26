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

Write-Host "[INFO] Starting server process on port $Port..." -ForegroundColor Cyan
$serverArgs = "-m `"$Model`" --path . --port $Port --host 127.0.0.1 -c $ContextSize"
$proc = Start-Process -FilePath $ServerExe -ArgumentList $serverArgs -PassThru -NoNewWindow

Write-Host "[INFO] Warming up model into memory..." -ForegroundColor Cyan

# 5-second countdown timer
for ($i = 5; $i -gt 0; $i--) {
    Write-Host "       Waiting for engine initialization... ${i}s " -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 1
    Write-Host "`r" -NoNewline
}
Write-Host ""

# Verify CSS readiness
$ready = $false
$attempts = 0
while (-not $ready -and $attempts -lt 15) {
    try {
        $res = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/css/style.css?v=2" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($res.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Milliseconds 600
    $attempts++
}

Write-Host "[INFO] Model & CSS confirmed ready! Opening browser..." -ForegroundColor Green
Start-Sleep -Milliseconds 500
Start-Process "http://localhost:$Port/"

Write-Host "`nServer is running! Press Ctrl+C in this window to stop.`n" -ForegroundColor Gray

try {
    $proc.WaitForExit()
} finally {
    if (-not $proc.HasExited) {
        $proc.Kill()
    }
}
