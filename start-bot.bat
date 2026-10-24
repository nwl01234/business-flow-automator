@echo off
chcp 65001 >nul
title Business Flow Bot
cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
  echo Сначала запусти start.bat — создаст окружение и зависимости.
  pause & exit /b 1
)

rem Подхватываем переменные из .env (BOT_TOKEN и др.)
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b" 2>nul

if not defined BOT_TOKEN (
  echo В .env нет BOT_TOKEN — получи токен у @BotFather и добавь строку: BOT_TOKEN=123456:ABC...
  pause & exit /b 1
)

rem Сервер должен работать, бот ходит в него по API. Если не поднят — поднимаем тихо.
curl -s -o nul http://127.0.0.1:8000/health 2>nul || (
  echo Сервер не запущен — стартую backend в фоне...
  start "bfa-server" /min .venv\Scripts\python -m uvicorn backend.app.main:app --port 8000
  timeout /t 5 >nul
)

echo ▶ Бот запущен. Открыть в Telegram: /start у бота. Останов: stop.bat
.venv\Scripts\python bot\bot.py
pause
