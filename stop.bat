@echo off
setlocal
rem Stop backend (port 8000). No pause - just stop and exit.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1
echo Port 8000 freed. Server stopped.
exit /b 0
