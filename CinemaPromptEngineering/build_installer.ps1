# Cinema Prompt Engineering - Windows Installer Builder
# Creates a standalone Windows executable using PyInstaller

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Cinema Prompt Engineering - Build Windows Installer" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ScriptDir

# Check for virtual environment
if (-not (Test-Path "venv\Scripts\python.exe")) {
    Write-Host "[ERROR] Virtual environment not found. Please run install.ps1 first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$venvPython = "$ScriptDir\venv\Scripts\python.exe"

# Step 1: Install PyInstaller
Write-Host "[1/5] Installing PyInstaller..." -ForegroundColor Yellow
# Use python -m pip to avoid shebang path issues when venv is copied/moved
& $venvPython -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install PyInstaller" -ForegroundColor Red
    exit 1
}
Write-Host "  Done" -ForegroundColor Green

# Step 2: Build Frontend
Write-Host "[2/5] Building frontend for standalone mode..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"

# Install cross-env if not present
& npm install cross-env --save-dev 2>&1 | Out-Null

# Install terser if not present
& npm install terser --save-dev 2>&1 | Out-Null

# Build for standalone
& npm run build:standalone
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Frontend build failed" -ForegroundColor Red
    Set-Location $ScriptDir
    exit 1
}
Write-Host "  Done" -ForegroundColor Green
Set-Location $ScriptDir

# Step 3: Prepare static files for bundling
Write-Host "[3/5] Preparing static files..." -ForegroundColor Yellow
$distDir = "$ScriptDir\dist"
$staticDir = "$distDir\static"

# Create dist directory if it doesn't exist
if (-not (Test-Path $staticDir)) {
    Write-Host "[WARNING] Static files not found at expected location." -ForegroundColor Yellow
    Write-Host "  Creating from ComfyUI build..." -ForegroundColor Gray
    
    New-Item -ItemType Directory -Path $staticDir -Force | Out-Null
    
    if (Test-Path "$ScriptDir\ComfyCinemaPrompting\web\app") {
        Copy-Item -Recurse -Force "$ScriptDir\ComfyCinemaPrompting\web\app\*" $staticDir
    }
}
Write-Host "  Done" -ForegroundColor Green

# Step 4: Run PyInstaller
Write-Host "[4/5] Building executable with PyInstaller..." -ForegroundColor Yellow
Write-Host "  This may take several minutes..." -ForegroundColor Gray

# Run PyInstaller with the spec file (it auto-detects dist/static)
& $venvPython -m PyInstaller --clean --noconfirm "$ScriptDir\cinema_prompt.spec"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] PyInstaller build failed" -ForegroundColor Red
    exit 1
}

Write-Host "  Done" -ForegroundColor Green

# Step 5: Package output
Write-Host "[5/5] Packaging final output..." -ForegroundColor Yellow

$outputDir = "$ScriptDir\dist\CinemaPromptEngineering-Windows"
if (Test-Path $outputDir) {
    Remove-Item -Recurse -Force $outputDir
}
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

# Copy executable
Copy-Item "$ScriptDir\dist\CinemaPromptEngineering.exe" $outputDir

# Create a simple launcher batch file
@"
@echo off
start "" "%~dp0CinemaPromptEngineering.exe"
"@ | Set-Content "$outputDir\Start Cinema Prompt Engineering.bat"

# Create README
@"
Cinema Prompt Engineering - Windows Standalone Application
==========================================================

To run the application:
1. Double-click "Start Cinema Prompt Engineering.bat" or "CinemaPromptEngineering.exe"
2. A browser window will open automatically
3. The application runs at http://localhost:8000

To stop the application:
- Close the console window, or press Ctrl+C

System Requirements:
- Windows 10 or later
- No additional dependencies required (all bundled)

For support, visit: https://github.com/NickPittas/CinemaPromptEngineering
"@ | Set-Content "$outputDir\README.txt"

Write-Host "  Done" -ForegroundColor Green

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Output directory:" -ForegroundColor Cyan
Write-Host "  $outputDir" -ForegroundColor White
Write-Host ""
Write-Host "  To create a distributable ZIP:" -ForegroundColor Gray
Write-Host "  Compress-Archive -Path `"$outputDir`" -DestinationPath `"$ScriptDir\dist\CinemaPromptEngineering-Windows.zip`"" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
