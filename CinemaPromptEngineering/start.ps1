<# 
.SYNOPSIS
    Director's Console Application Launcher
.DESCRIPTION
    Starts both the FastAPI backend and React frontend for Director's Console.
    - Creates/validates Python virtual environment
    - Installs/updates Python and npm dependencies
    - Starts backend API on port 8000
    - Starts frontend dev server on port 5173 (or 3000)
    - Opens browser when ready
.NOTES
    Author: Director's Console Team
    Date: January 28, 2026
#>

param(
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$SkipDepsCheck,
    [switch]$NoBrowser,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Director's Console Launcher

Usage: .\start.ps1 [options]

Options:
    -BackendPort <int>    Backend API port (default: 8000)
    -FrontendPort <int>   Frontend dev port (default: 5173)
    -BackendOnly          Start only the backend
    -FrontendOnly         Start only the frontend
    -SkipDepsCheck        Skip dependency verification
    -NoBrowser            Don't open browser automatically
    -Help                 Show this help message

Examples:
    .\start.ps1                          # Start both backend and frontend
    .\start.ps1 -BackendOnly             # Start only the backend
    .\start.ps1 -BackendPort 8001        # Use custom backend port
"@
    exit 0
}

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Director's Console" -ForegroundColor Cyan
Write-Host "  Cinema Prompt Engineering" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Helper Functions ---
function Write-Status($message, $color = "White") {
    Write-Host "[*] $message" -ForegroundColor $color
}

function Write-Success($message) {
    Write-Host "[+] $message" -ForegroundColor Green
}

function Write-Err($message) {
    Write-Host "[!] $message" -ForegroundColor Red
}

function Test-Port($port) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

function Stop-ProcessOnPort($port) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($process -and $process.Name -ne "System") {
            Write-Status "Stopping process $($process.Name) (PID: $($process.Id)) on port $port" "Yellow"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 500
        }
    }
}

function Wait-ForEndpoint($url, $maxWait = 30) {
    $elapsed = 0
    while ($elapsed -lt $maxWait) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                return $true
            }
        } catch {
            # Ignore errors, keep waiting
        }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    return $false
}

# --- Free ports if in use ---
if (-not $FrontendOnly) {
    if (Test-Port $BackendPort) {
        Write-Status "Port $BackendPort is in use, freeing it..." "Yellow"
        Stop-ProcessOnPort $BackendPort
    }
}

if (-not $BackendOnly) {
    if (Test-Port $FrontendPort) {
        Write-Status "Port $FrontendPort is in use, freeing it..." "Yellow"
        Stop-ProcessOnPort $FrontendPort
    }
}

# --- Backend Setup ---
if (-not $FrontendOnly) {
    Write-Host ""
    Write-Host "--- Backend Setup ---" -ForegroundColor Cyan
    
    # Find or create virtual environment
    $venvPaths = @("venv", ".venv", "env")
    $pythonExe = $null

    foreach ($path in $venvPaths) {
        $testPython = Join-Path $ScriptDir "$path\Scripts\python.exe"
        if (Test-Path $testPython) {
            $pythonExe = $testPython
            Write-Success "Found venv: $path"
            break
        }
    }

    if (-not $pythonExe) {
        Write-Status "Creating virtual environment..." "Yellow"
        
        $uvExe = Get-Command "uv" -ErrorAction SilentlyContinue
        if ($uvExe) {
            & uv venv venv
        } else {
            & python -m venv venv
        }
        
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to create virtual environment"
            exit 1
        }
        
        $pythonExe = Join-Path $ScriptDir "venv\Scripts\python.exe"
        Write-Success "Created venv"
    }

    # Check dependencies
    if (-not $SkipDepsCheck) {
        $requirementsFile = Join-Path $ScriptDir "requirements.txt"
        if (Test-Path $requirementsFile) {
            Write-Status "Checking Python dependencies..."
            
            # Quick check for key package
            $checkResult = & $pythonExe -c "import fastapi" 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Status "Installing Python dependencies..."
                
                $uvExe = Get-Command "uv" -ErrorAction SilentlyContinue
                if ($uvExe) {
                    & uv pip install -r $requirementsFile
                } else {
                    & $pythonExe -m pip install -r $requirementsFile -q
                }
                
                if ($LASTEXITCODE -ne 0) {
                    Write-Err "Failed to install Python dependencies"
                    exit 1
                }
                Write-Success "Python dependencies installed"
            } else {
                Write-Success "Python dependencies satisfied"
            }
        }
    }

    # Start backend
    Write-Status "Starting backend on port $BackendPort..."
    
    $backendJob = Start-Job -ScriptBlock {
        param($python, $port, $dir)
        Set-Location $dir
        & $python -m uvicorn api.main:app --host 0.0.0.0 --port $port --reload
    } -ArgumentList $pythonExe, $BackendPort, $ScriptDir
    
    Write-Success "Backend starting (Job ID: $($backendJob.Id))"
    
    # Wait for backend to be ready
    Write-Status "Waiting for backend to be ready..."
    $backendReady = Wait-ForEndpoint "http://localhost:$BackendPort/api/health" 30
    
    if ($backendReady) {
        Write-Success "Backend ready at http://localhost:$BackendPort"
    } else {
        Write-Err "Backend failed to start within 30 seconds"
        Write-Status "Check backend logs with: Receive-Job -Id $($backendJob.Id)"
    }
}

# --- Frontend Setup ---
if (-not $BackendOnly) {
    Write-Host ""
    Write-Host "--- Frontend Setup ---" -ForegroundColor Cyan
    
    $frontendDir = Join-Path $ScriptDir "frontend"
    Set-Location $frontendDir
    
    # Check for Node.js
    $nodeExe = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeExe) {
        Write-Err "Node.js not found. Please install Node.js from https://nodejs.org"
        exit 1
    }
    Write-Success "Node.js found: $(node --version)"
    
    # Check for npm
    $npmExe = Get-Command "npm" -ErrorAction SilentlyContinue
    if (-not $npmExe) {
        Write-Err "npm not found"
        exit 1
    }
    
    # Check node_modules
    if (-not $SkipDepsCheck) {
        $nodeModules = Join-Path $frontendDir "node_modules"
        if (-not (Test-Path $nodeModules)) {
            Write-Status "Installing npm dependencies (first run)..."
            & npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Err "npm install failed"
                exit 1
            }
            Write-Success "npm dependencies installed"
        } else {
            Write-Success "npm dependencies present"
        }
    }
    
    # Create/update .env file with API URLs
    $envFile = Join-Path $frontendDir ".env.local"
    @"
# Auto-generated by start.ps1
VITE_API_BASE=http://localhost:$BackendPort
VITE_ORCHESTRATOR_URL=http://localhost:8020
"@ | Out-File -FilePath $envFile -Encoding UTF8
    Write-Status "Updated .env.local with API URLs"
    
    # Start frontend
    Write-Status "Starting frontend on port $FrontendPort..."
    
    $frontendJob = Start-Job -ScriptBlock {
        param($dir, $port)
        Set-Location $dir
        $env:PORT = $port
        & npm run dev -- --port $port
    } -ArgumentList $frontendDir, $FrontendPort
    
    Write-Success "Frontend starting (Job ID: $($frontendJob.Id))"
    
    # Wait for frontend
    Start-Sleep -Seconds 5
    
    Set-Location $ScriptDir
}

# --- Summary ---
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Director's Console Running!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

if (-not $FrontendOnly) {
    Write-Host "  Backend:  http://localhost:$BackendPort" -ForegroundColor White
    Write-Host "  API Docs: http://localhost:$BackendPort/docs" -ForegroundColor DarkGray
}

if (-not $BackendOnly) {
    Write-Host "  Frontend: http://localhost:$FrontendPort" -ForegroundColor White
}

Write-Host ""
Write-Host "  Orchestrator should be running separately:" -ForegroundColor Yellow
Write-Host "  cd .. && .\start-all.ps1" -ForegroundColor DarkGray
Write-Host ""

# Open browser
if (-not $NoBrowser -and -not $BackendOnly) {
    Start-Sleep -Seconds 3
    Write-Status "Opening browser..."
    Start-Process "http://localhost:$FrontendPort"
}

# Keep script running and show logs
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor DarkGray
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Check if jobs are still running
        if (-not $FrontendOnly -and $backendJob) {
            $backendState = Get-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
            if ($backendState -and $backendState.State -eq "Failed") {
                Write-Err "Backend job failed!"
                Receive-Job -Id $backendJob.Id
            }
        }
        
        if (-not $BackendOnly -and $frontendJob) {
            $frontendState = Get-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
            if ($frontendState -and $frontendState.State -eq "Failed") {
                Write-Err "Frontend job failed!"
                Receive-Job -Id $frontendJob.Id
            }
        }
    }
} finally {
    Write-Host ""
    Write-Status "Stopping services..." "Yellow"
    
    if ($backendJob) {
        Stop-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($frontendJob) {
        Stop-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Success "Services stopped"
}
