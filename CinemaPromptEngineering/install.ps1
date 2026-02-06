# Cinema Prompt Engineering - Windows Installation Script
# Run this script once to set up the application
# Automatically downloads Python 3.12 if not found on the system

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "  Cinema Prompt Engineering - Windows Installer" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Python configuration
$RequiredPythonVersion = "3.12"
$PythonFullVersion = "3.12.8"
$EmbeddedPythonDir = "$ScriptDir\python"
$EmbeddedPython = "$EmbeddedPythonDir\python.exe"

# =============================================================================
# STEP 1: Check/Download Python
# =============================================================================
Write-Host "[1/6] Checking Python $RequiredPythonVersion..." -ForegroundColor Yellow

$UseEmbeddedPython = $false

# Check if we already have embedded Python
if (Test-Path $EmbeddedPython) {
    $pythonVersion = & $EmbeddedPython --version 2>&1
    Write-Host "  Found embedded: $pythonVersion" -ForegroundColor Green
    $UseEmbeddedPython = $true
}
else {
    # Try py launcher first (preferred on Windows)
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        $pythonVersion = & py -$RequiredPythonVersion --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  Found system: $pythonVersion (via py launcher)" -ForegroundColor Green
            $UseEmbeddedPython = $false
        }
    }
    
    # If no system Python 3.12, download embedded version
    if (-not $pythonVersion -or $LASTEXITCODE -ne 0) {
        Write-Host "  Python $RequiredPythonVersion not found on system" -ForegroundColor Yellow
        Write-Host "  Downloading Python $PythonFullVersion embedded package..." -ForegroundColor Yellow
        
        $PythonZipUrl = "https://www.python.org/ftp/python/$PythonFullVersion/python-$PythonFullVersion-embed-amd64.zip"
        $PythonZipFile = "$ScriptDir\python-embed.zip"
        
        try {
            # Download Python embeddable package
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            $ProgressPreference = 'SilentlyContinue'  # Speed up download
            Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZipFile -UseBasicParsing
            
            # Extract
            Write-Host "  Extracting Python..." -ForegroundColor Yellow
            if (Test-Path $EmbeddedPythonDir) {
                Remove-Item -Recurse -Force $EmbeddedPythonDir
            }
            Expand-Archive -Path $PythonZipFile -DestinationPath $EmbeddedPythonDir -Force
            Remove-Item $PythonZipFile
            
            # Enable pip by modifying python312._pth
            $pthFile = "$EmbeddedPythonDir\python312._pth"
            if (Test-Path $pthFile) {
                $pthContent = Get-Content $pthFile
                $pthContent = $pthContent -replace '#import site', 'import site'
                # Add Lib\site-packages for pip
                $pthContent += "Lib\site-packages"
                Set-Content $pthFile $pthContent
            }
            
            # Download and install pip
            Write-Host "  Installing pip..." -ForegroundColor Yellow
            $GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
            $GetPipFile = "$EmbeddedPythonDir\get-pip.py"
            Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipFile -UseBasicParsing
            
            # Create Lib\site-packages directory
            New-Item -ItemType Directory -Path "$EmbeddedPythonDir\Lib\site-packages" -Force | Out-Null
            
            # Install pip
            & $EmbeddedPython $GetPipFile --no-warn-script-location 2>&1 | Out-Null
            Remove-Item $GetPipFile -ErrorAction SilentlyContinue
            
            $pythonVersion = & $EmbeddedPython --version 2>&1
            Write-Host "  Downloaded and configured: $pythonVersion" -ForegroundColor Green
            $UseEmbeddedPython = $true
        }
        catch {
            Write-Host "[ERROR] Failed to download Python: $_" -ForegroundColor Red
            Write-Host "Please install Python $RequiredPythonVersion manually from https://python.org" -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
}

# =============================================================================
# STEP 2: Check Node.js
# =============================================================================
Write-Host "[2/6] Checking Node.js installation..." -ForegroundColor Yellow
$npmPath = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmPath) {
    Write-Host "[ERROR] Node.js/npm is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVersion = & node --version 2>&1
Write-Host "  Found: Node.js $nodeVersion" -ForegroundColor Green

# =============================================================================
# STEP 3: Create Virtual Environment
# =============================================================================
Write-Host "[3/6] Creating Python virtual environment..." -ForegroundColor Yellow

if (Test-Path "$ScriptDir\venv") {
    Write-Host "  Virtual environment already exists, skipping creation" -ForegroundColor Gray
} else {
    if ($UseEmbeddedPython) {
        # For embedded Python, we'll use it directly instead of venv
        # Copy embedded Python to venv structure for compatibility
        Write-Host "  Setting up Python environment from embedded package..." -ForegroundColor Yellow
        
        New-Item -ItemType Directory -Path "$ScriptDir\venv\Scripts" -Force | Out-Null
        
        # Copy Python files to venv
        Copy-Item "$EmbeddedPythonDir\*" "$ScriptDir\venv\Scripts\" -Recurse -Force
        
        # Create a python.exe in venv root for compatibility
        if (-not (Test-Path "$ScriptDir\venv\Scripts\python.exe")) {
            Write-Host "[ERROR] Failed to set up Python environment" -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        
        Write-Host "  Created: venv\ (Python $PythonFullVersion embedded)" -ForegroundColor Green
    } else {
        # Use system Python with py launcher
        & py -$RequiredPythonVersion -m venv venv
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERROR] Failed to create virtual environment" -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "  Created: venv\ (Python $RequiredPythonVersion)" -ForegroundColor Green
    }
}

# =============================================================================
# STEP 4: Install Python Dependencies
# =============================================================================
Write-Host "[4/6] Installing Python dependencies..." -ForegroundColor Yellow

$VenvPython = "$ScriptDir\venv\Scripts\python.exe"

# Upgrade pip and install build tools first (required for embedded Python)
Write-Host "  Installing build tools..." -ForegroundColor Gray
& $VenvPython -m pip install --upgrade pip setuptools wheel --no-warn-script-location 2>&1 | Out-Null

# Install requirements
& $VenvPython -m pip install -r requirements.txt --no-warn-script-location
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install Python dependencies" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Python dependencies installed" -ForegroundColor Green

# =============================================================================
# STEP 5: Install Node.js Dependencies
# =============================================================================
Write-Host "[5/6] Installing Node.js dependencies for frontend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to install npm dependencies" -ForegroundColor Red
    Set-Location $ScriptDir
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "  Frontend dependencies installed" -ForegroundColor Green

# =============================================================================
# STEP 6: Build Frontend
# =============================================================================
Write-Host "[6/6] Building frontend for production..." -ForegroundColor Yellow
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARNING] Frontend build failed, will use dev server instead" -ForegroundColor Yellow
} else {
    Write-Host "  Frontend built successfully" -ForegroundColor Green
}

Set-Location $ScriptDir

# =============================================================================
# Done!
# =============================================================================
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application, run:" -ForegroundColor Cyan
Write-Host "  .\run.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or double-click 'run.bat'" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
