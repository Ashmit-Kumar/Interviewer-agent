@echo off
echo ========================================
echo  Stopping Interview Platform Services
echo ========================================
echo.

echo Killing Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Node.js processes stopped
) else (
    echo [INFO] No Node.js processes found
)
echo.

echo Killing Python processes...
taskkill /F /IM python.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo [SUCCESS] Python processes stopped
) else (
    echo [INFO] No Python processes found
)
echo.

echo Cleaning up ports...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8080" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo.

echo ========================================
echo  All Services Stopped
echo ========================================
pause
