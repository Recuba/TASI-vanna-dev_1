@echo off
setlocal

set "ROOT=%~dp0"
set "FRONTEND=%ROOT%frontend"

echo.
echo ============================================================
echo   Ra'd AI TASI Platform
echo ============================================================
echo.

:: ── 1. Kill anything on ports 8084 and 3000 ─────────────────
echo [1/3] Clearing ports 8084 and 3000...
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8084 " 2^>nul') do (
    taskkill /PID %%p /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":3000 " 2^>nul') do (
    taskkill /PID %%p /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: ── 2. Start backend in a new window ─────────────────────────
echo [2/3] Starting backend on http://localhost:8084 ...
cd /d "%ROOT%"
start "Ra'd AI Backend" cmd /k "python app.py"

:: Give the backend a moment to initialize
timeout /t 3 /nobreak >nul

:: ── 3. Start frontend dev server in a new window ─────────────
echo [3/3] Starting frontend on http://localhost:3000 ...
cd /d "%FRONTEND%"
start "Ra'd AI Frontend" cmd /k "npx next dev"

echo.
echo ============================================================
echo   Both servers are starting:
echo     Backend:  http://localhost:8084
echo     Frontend: http://localhost:3000
echo ============================================================
echo.
echo   Close the two terminal windows to stop the servers.
echo.
pause
