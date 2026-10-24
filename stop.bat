@echo off
chcp 65001 >nul
rem Останавливаем всё, что слушает порт 8000 (backend) + bash-подобные хвосты
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5432 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
echo ▶ Остановлено (порт 8000 освобождён).
pause
