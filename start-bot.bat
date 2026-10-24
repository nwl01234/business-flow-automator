@echo off
setlocal
rem Telegram bot launcher: loads .env, starts backend if needed, runs bot (ASCII only)
title Business Flow Bot
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo ERROR: virtual environment not found. Run start.bat first.
    pause
    exit /b 1
)

rem Load variables from .env (values must not contain quotes)
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"

if not defined BOT_TOKEN (
    echo ERROR: BOT_TOKEN not set. Get a token from @BotFather and add line to .env:
    echo BOT_TOKEN=123456789:AA...
    pause
    exit /b 1
)

rem Start backend if not running yet
curl -s -o nul http://127.0.0.1:8000/health >nul 2>&1
if errorlevel 1 (
    echo Backend not running. Starting it in background...
    start "bfa-server" /min .venv\Scripts\python -m uvicorn backend.app.main:app --port 8000
    timeout /t 5 >nul
)

rem Kill other local instances of the bot (same token must not poll twice)
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*bot\bot.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

echo Bot is starting. Open your bot in Telegram and send /start
echo Stop with Ctrl+C or stop.bat
.venv\Scripts\python bot\bot.py

pause
