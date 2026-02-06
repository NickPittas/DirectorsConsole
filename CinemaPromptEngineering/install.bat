@echo off
REM Cinema Prompt Engineering - Windows Installer
REM Run this script once to set up the application

echo.
echo =======================================================
echo   Cinema Prompt Engineering - Windows Installer
echo =======================================================
echo.

cd /d "%~dp0"

REM Check for Python
echo [1/6] Checking Python installation...
where python >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)
python --version
echo.

REM Check for Node.js
echo [2/6] Checking Node.js installation...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js/npm is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)
node --version
echo.

REM Create virtual environment
echo [3/6] Creating Python virtual environment...
if exist venv (
    echo   Virtual environment already exists, skipping creation
) else (
    %PYTHON_CMD% -m venv venv
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment
        echo Make sure Python %REQUIRED_PYTHON% is installed
        pause
        exit /b 1
    )
    echo   Created: venv\ with Python %REQUIRED_PYTHON%
)

REM Install Python dependencies
echo [4/6] Installing Python dependencies...
REM Use python -m pip to avoid shebang path issues when venv is copied/moved
call venv\Scripts\python.exe -m pip install -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install Python dependencies
    pause
    exit /b 1
)
echo   Python dependencies installed

REM Install Node.js dependencies
echo [5/6] Installing Node.js dependencies for frontend...
cd frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to install npm dependencies
    pause
    exit /b 1
)
echo   Frontend dependencies installed
cd ..

REM Build frontend
echo [6/6] Building frontend for production...
cd frontend
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Frontend build failed, will use dev server instead
) else (
    echo   Frontend built successfully
)
cd ..

echo.
echo =======================================================
echo   Installation Complete!
echo =======================================================
echo.
echo To start the application, run: run.bat
echo.
pause
