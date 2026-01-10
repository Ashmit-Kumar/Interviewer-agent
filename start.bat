@echo off
echo ========================================
echo  Interview Platform Launcher
echo ========================================
echo.

REM Check if installations are done
if not exist agent\venv (
    echo [ERROR] Python virtual environment not found
    echo Please run install.bat first
    pause
    exit /b 1
)

if not exist backend\node_modules (
    echo [ERROR] Backend dependencies not installed
    echo Please run install.bat first
    pause
    exit /b 1
)

if not exist frontend\node_modules (
    echo [ERROR] Frontend dependencies not installed
    echo Please run install.bat first
    pause
    exit /b 1
)

REM Check environment files
if not exist agent\.env (
    echo [WARNING] agent/.env not found
    echo Copy agent/.env.example to agent/.env and configure API keys
    echo.
)

if not exist backend\.env (
    echo [WARNING] backend/.env not found
    echo Ensure backend/.env exists with configuration
    echo.
)

echo Starting all services...
echo.

REM Start MongoDB check
echo [INFO] Checking MongoDB...
mongo --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] MongoDB CLI not found. Ensure MongoDB is running!
)
echo.

REM Kill any existing processes on common ports
echo [INFO] Cleaning up ports...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo.

echo ========================================
echo  Starting Services (in order)...
echo ========================================
echo.

REM Start Python Agent in new window
echo [1/3] Starting Python Agent...
start "LiveKit Agent" cmd /k "cd agent && call venv\Scripts\activate && python agent.py dev"
timeout /t 5 /nobreak >nul
echo [SUCCESS] Agent started (check new window)
echo.

REM Start Backend in new window
echo [2/3] Starting Backend Server...
start "Backend Server" cmd /k "cd backend && npm run dev"
timeout /t 5 /nobreak >nul
echo [SUCCESS] Backend started on http://localhost:5000
echo.

REM Start Frontend in new window
echo [3/3] Starting Frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"
timeout /t 5 /nobreak >nul
echo [SUCCESS] Frontend starting on http://localhost:3000
echo.

echo ========================================
echo  All Services Started!
echo ========================================
echo.
echo Services running in separate windows:
echo   - Python Agent: Check dedicated window
echo   - Backend:  http://localhost:5000
echo   - Frontend: http://localhost:3000 (opens in browser)
echo.
echo Press any key to view status or Ctrl+C to exit
pause >nul

REM Show running processes
echo.
echo Active Node processes:
tasklist | findstr "node.exe"
echo.
echo Active Python processes:
tasklist | findstr "python.exe"
echo.
echo Press any key to exit (services will keep running)
pause
