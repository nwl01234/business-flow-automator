@echo off
setlocal
rem Business Flow Automator - local launcher (ASCII only, robust parsing)
title Business Flow Automator
cd /d "%~dp0"

echo === Business Flow Automator ===
echo.

if exist .venv\Scripts\python.exe goto deps

echo [1/3] Creating virtual environment...
py -3.11 -m venv .venv 2>nul
if not errorlevel 1 goto venv_ok
py -3.10 -m venv .venv 2>nul
if not errorlevel 1 goto venv_ok
python -m venv .venv 2>nul
if not errorlevel 1 goto venv_ok
echo ERROR: Python not found. Install it from https://www.python.org/downloads/
pause
exit /b 1

:venv_ok
echo        venv ready

:deps
echo [2/3] Checking dependencies...
.venv\Scripts\python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo        Installing requirements, 1-2 minutes...
    .venv\Scripts\pip install -q -r backend\requirements.txt
    if errorlevel 1 goto pipfail
)

echo [3/3] Starting server: http://localhost:8000  (demo login: admin / admin123)
start "bfa-server" /min .venv\Scripts\python -m uvicorn backend.app.main:app --port 8000

set /a tries=0
:waitloop
curl -s -o nul http://127.0.0.1:8000/health >nul 2>&1
if not errorlevel 1 goto up
timeout /t 1 >nul
set /a tries+=1
if %tries% lss 30 goto waitloop
echo ERROR: server did not start in 30 sec. Check the "bfa-server" window.
pause
exit /b 1

:pipfail
echo ERROR: pip install failed. Check internet connection.
pause
exit /b 1

:up
start "" http://localhost:8000
echo.
echo OK: dashboard is open. Server runs in the minimized "bfa-server" window.
echo To stop: stop.bat
pause
exit /b 0
