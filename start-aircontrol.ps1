# AirControl Unified PowerShell Launcher
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "          Starting AirControl System          " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Check and start backend
$backendRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 10000 -InformationLevel Quiet
if (-not $backendRunning) {
    Write-Host "Starting backend on port 10000..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; npm start" -WindowStyle Minimized
} else {
    Write-Host "Backend already running on port 10000." -ForegroundColor Green
}

# Check and start frontend
$frontendRunning = Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -InformationLevel Quiet
if (-not $frontendRunning) {
    Write-Host "Starting frontend on port 5173..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\frontend'; npm run dev" -WindowStyle Minimized
} else {
    Write-Host "Frontend already running on port 5173." -ForegroundColor Green
}

# Open dashboard
Start-Process "http://localhost:5173"

# Start gesture agent
Write-Host "Launching Gesture Agent (Press Q or Esc in preview window to exit)..." -ForegroundColor Magenta
Set-Location "$root\agent"
& ".\.venv\Scripts\python.exe" "main.py"
