@echo off
REM Cinema Prompt Engineering - Windows Installer Builder
REM Creates a standalone Windows executable using PyInstaller

echo.
echo =======================================================
echo   Cinema Prompt Engineering - Build Windows Installer
echo =======================================================
echo.

cd /d "%~dp0"

REM Check for virtual environment
if not exist venv\Scripts\python.exe (
    echo [ERROR] Virtual environment not found. Please run install.bat first.
    pause
    exit /b 1
)

REM Call the PowerShell build script
powershell -ExecutionPolicy Bypass -File "%~dp0build_installer.ps1"
