@echo off
REM Cinema Prompt Engineering - Startup Script
REM Starts both the backend API and frontend dev server using the virtual environment

echo ============================================
echo  Cinema Prompt Engineering - Starting...
echo ============================================
echo.

cd /d "%~dp0"

REM Check for virtual environment
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found at: venv\
    echo Please run install.bat or install.ps1 first to set up the application.
    pause
    exit /b 1
)
echo [OK] Virtual environment found

REM Check if Node is available
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js/npm is not installed or not in PATH
    pause
    exit /b 1
)
echo [OK] Node.js/npm found

echo.
echo [1/4] Killing existing processes on ports 8000 and 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
echo   Done

echo [2/4] Starting Backend API (port 8000)...
REM Clear PYTHONHOME and PYTHONPATH to prevent system Python interference
REM Use full path to venv python.exe
start "Cinema API" cmd /k "cd /d "%~dp0" && set PYTHONHOME= && set PYTHONPATH= && "%~dp0venv\Scripts\python.exe" -m uvicorn api.main:app --reload --port 8000"

echo [3/4] Checking frontend dependencies...
cd /d "%~dp0frontend"
if not exist node_modules (
    echo   Installing npm dependencies...
    call npm install
)
echo   Done

echo [4/4] Starting Frontend Dev Server (port 3000)...
start "Cinema Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ============================================
echo  Both servers starting!
echo ============================================
echo.
echo  Backend API:  http://localhost:8000
echo  Frontend UI:  http://localhost:3000
echo  API Docs:     http://localhost:8000/docs
echo.
echo  Close the terminal windows to stop servers.
echo ============================================

REM Wait a moment then open browser
echo.
echo Waiting for servers to start...
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo.
pause
