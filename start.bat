@echo off
chcp 65001 >nul
title Business Flow Automator
cd /d "%~dp0"

echo ── Business Flow Automator ──────────────────────────

if not exist .venv\Scripts\python.exe (
  echo [1/3] Создаю виртуальное окружение...
  py -3.11 -m venv .venv 2>nul || py -3.10 -m venv .venv 2>nul || python -m venv .venv
  if errorlevel 1 ( echo Python не найден. Установи с python.org & pause & exit /b 1 )
)

echo [2/3] Проверяю зависимости...
.venv\Scripts\python -c "import fastapi" 2>nul
if errorlevel 1 (
  echo        Ставлю пакеты из requirements.txt...
  .venv\Scripts\pip install -q -r backend\requirements.txt
)

echo [3/3] Сервер поднимается на http://localhost:8000  (демо: admin / admin123)

start "bfa-server" /min .venv\Scripts\python -m uvicorn backend.app.main:app --port 8000

for /l %%i in (1,1,30) do (
  curl -s -o nul http://127.0.0.1:8000/health 2>nul && goto :up
  timeout /t 1 >nul
)
echo Сервер не поднялся за 30 сек — смотри окно "bfa-server".
pause & exit /b 1

:up
start "" http://localhost:8000
echo ▶ Дашборд открыт. Сервер работает в свёрнутом окне "bfa-server".
echo   Остановить: stop.bat
pause
