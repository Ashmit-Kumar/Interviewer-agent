@echo off
echo ========================================
echo  Interview Platform Setup
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Installing Python Agent Dependencies...
echo ========================================
cd agent
if not exist venv (
    echo Creating Python virtual environment...
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install Python dependencies
    pause
    exit /b 1
)
deactivate
cd ..
echo [SUCCESS] Python agent dependencies installed
echo.

echo [2/4] Installing Backend Dependencies...
echo ========================================
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
cd ..
echo [SUCCESS] Backend dependencies installed
echo.

echo [3/4] Installing Frontend Dependencies...
echo ========================================
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install frontend dependencies
    pause
    exit /b 1
)
cd ..
echo [SUCCESS] Frontend dependencies installed
echo.

echo [4/4] Environment Setup Check...
echo ========================================
if not exist agent\.env (
    echo [WARNING] agent/.env not found
    echo Please copy agent/.env.example to agent/.env and add your API keys
)
if not exist backend\.env (
    echo [WARNING] backend/.env not found
    echo Please ensure backend/.env exists with required configuration
)
echo.

echo ========================================
echo  Installation Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Configure agent/.env with API keys
echo 2. Configure backend/.env with database settings
echo 3. Start MongoDB if not running
echo 4. Run start.bat to launch all services
echo.
pause
