@echo off
echo ===================================================
echo   Starting AICTE CaseSync (Backend + Frontend)
echo ===================================================

:: Start Backend on port 5000 in a new window
start "AICTE CaseSync - Backend Server (Port 5000)" cmd /k "cd /d %~dp0backend && node server.js"

:: Start Frontend on port 5173 in a new window
start "AICTE CaseSync - Frontend Vite (Port 5173)" cmd /k "cd /d %~dp0 && npm.cmd run dev"

:: Wait 3 seconds for servers to initialize
timeout /t 3 >nul

:: Open the browser at localhost:5173
start http://localhost:5173

echo.
echo Application is running!
echo Access CaseSync in your browser at: http://localhost:5173
echo.
pause
