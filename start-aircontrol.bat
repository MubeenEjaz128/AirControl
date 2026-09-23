@echo off
title AirControl Launcher
echo ==============================================
echo           Starting AirControl System
echo ==============================================

cd /d "%~dp0"

:: Start backend if not listening on port 10000
powershell -NoProfile -Command "if (!(Test-NetConnection -ComputerName 127.0.0.1 -Port 10000 -InformationLevel Quiet)) { Write-Host 'Starting backend...'; Start-Process cmd -ArgumentList '/c cd /d ""%~dp0backend"" && npm start' -WindowStyle Minimized }"

:: Start frontend if not listening on port 5173
powershell -NoProfile -Command "if (!(Test-NetConnection -ComputerName 127.0.0.1 -Port 5173 -InformationLevel Quiet)) { Write-Host 'Starting frontend...'; Start-Process cmd -ArgumentList '/c cd /d ""%~dp0frontend"" && npm run dev' -WindowStyle Minimized }"

:: Open Dashboard
start "" "http://localhost:5173"

:: Launch Python Gesture Agent
echo Starting Gesture Agent (Press Q or Esc in preview window to exit)...
cd /d "%~dp0agent"
call .\.venv\Scripts\activate.bat
python main.py
