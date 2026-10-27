@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [business-flow-automator] запуск веб-приложения на http://127.0.0.1:8000
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  .venv\Scripts\pip install -q -r backend\requirements.txt
)
start "" http://127.0.0.1:8000
.venv\Scripts\python -m uvicorn backend.app.main:app --port 8000
