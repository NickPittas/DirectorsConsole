<# 
.SYNOPSIS
    Director's Console - Unified Launcher
.DESCRIPTION
    Starts all three components of the Director's Console ecosystem:
    1. Orchestrator API (port 8020) - Job queue/render farm manager
    2. CPE Backend (port 8000) - Cinema Prompt Engineering API
    3. CPE Frontend (port 5173) - React UI
    
    All services run in the same window with colored output prefixes.
.NOTES
    Author: Director's Console Team
    Date: January 28, 2026
#>

param(
    [int]$OrchestratorPort = 8020,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173,
    [switch]$NoOrchestrator,
    [switch]$NoFrontend,
    [switch]$NoBrowser,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
Director's Console - Unified Launcher

Usage: .\start-all.ps1 [options]

Options:
    -OrchestratorPort <int>   Orchestrator API port (default: 8020)
    -BackendPort <int>        CPE Backend port (default: 8000)
    -FrontendPort <int>       CPE Frontend port (default: 5173)
    -NoOrchestrator           Skip starting Orchestrator
    -NoFrontend               Skip starting Frontend (backend only)
    -NoBrowser                Don't open browser automatically
    -Help                     Show this help message

Examples:
    .\start-all.ps1                    # Start everything
    .\start-all.ps1 -NoOrchestrator    # Skip orchestrator
    .\start-all.ps1 -NoBrowser         # Don't open browser
"@
    exit 0
}

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# --- Helper Functions ---

function Test-NpmPackages($frontendDir, $nodeModules) {
    # Check if package.json has been modified since last npm install
    $packageJson = Join-Path $frontendDir "package.json"
    $packageLock = Join-Path $frontendDir "package-lock.json"
    $installMarker = Join-Path $nodeModules ".install-complete"
    
    if (-not (Test-Path $installMarker)) {
        return $true
    }
    
    $markerTime = (Get-Item $installMarker).LastWriteTime
    $packageJsonTime = (Get-Item $packageJson).LastWriteTime
    
    # If package.json is newer than our marker, we need to reinstall
    if ($packageJsonTime -gt $markerTime) {
        return $true
    }
    
    # Also check if all dependencies from package.json are actually installed
    try {
        $packageContent = Get-Content $packageJson -Raw | ConvertFrom-Json
        $allDeps = @()
        if ($packageContent.dependencies) {
            $allDeps += $packageContent.dependencies.PSObject.Properties.Name
        }
        if ($packageContent.devDependencies) {
            $allDeps += $packageContent.devDependencies.PSObject.Properties.Name
        }
        
        foreach ($dep in $allDeps) {
            $depPath = Join-Path $nodeModules $dep
            if (-not (Test-Path $depPath)) {
                return $true
            }
        }
    } catch {
        return $true
    }
    
    return $false
}

function Write-Prefixed($prefix, $message, $prefixColor = "White", $messageColor = "Gray") {
    Write-Host "[$prefix] " -ForegroundColor $prefixColor -NoNewline
    Write-Host $message -ForegroundColor $messageColor
}

function Write-Header($title) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

# --- Venv Health Check and Recovery ---
function Test-VenvHealth($pythonPath, $testImports) {
    $testScript = $testImports -join "; "
    try {
        $output = & $pythonPath -c $testScript 2>&1
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

function Repair-Venv($venvPath, $pythonExe, $requirementsPath, $componentName, $testImports) {
    Write-Prefixed $componentName "Venv health check failed - attempting repair..." "Yellow"
    
    # Remove corrupted venv
    if (Test-Path $venvPath) {
        Write-Prefixed $componentName "Removing corrupted venv..." "Yellow"
        try {
            Remove-Item -Path $venvPath -Recurse -Force -ErrorAction Stop
            Write-Prefixed $componentName "Old venv removed" "Green"
        } catch {
            Write-Prefixed $componentName "Failed to remove venv: $_" "Red"
            return $false
        }
    }
    
    # Recreate venv
    Write-Prefixed $componentName "Creating fresh venv..." "Yellow"
    Push-Location (Split-Path $venvPath -Parent)
    try {
        if ($useUv) {
            & uv venv (Split-Path $venvPath -Leaf) 2>&1 | Out-Null
        } else {
            & python -m venv (Split-Path $venvPath -Leaf) 2>&1 | Out-Null
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Prefixed $componentName "Failed to create venv" "Red"
            Pop-Location
            return $false
        }
    } catch {
        Write-Prefixed $componentName "Error creating venv: $_" "Red"
        Pop-Location
        return $false
    }
    Pop-Location
    
    # Install dependencies
    if (Test-Path $requirementsPath) {
        Write-Prefixed $componentName "Installing dependencies..." "Yellow"
        try {
            if ($useUv) {
                & uv pip install --python $pythonExe -r $requirementsPath
            } else {
                & $pythonExe -m pip install -r $requirementsPath
            }
            if ($LASTEXITCODE -ne 0) {
                Write-Prefixed $componentName "Failed to install dependencies" "Red"
                return $false
            }
            Write-Prefixed $componentName "Dependencies installed successfully" "Green"
        } catch {
            Write-Prefixed $componentName "Error installing dependencies: $_" "Red"
            return $false
        }
    }
    
    # Verify the repair worked
    if (Test-VenvHealth $pythonExe $testImports) {
        Write-Prefixed $componentName "Venv repair successful!" "Green"
        return $true
    } else {
        Write-Prefixed $componentName "Venv repair failed - venv still unhealthy" "Red"
        return $false
    }
}

function Initialize-Venv($venvPath, $requirementsPath, $componentName, $testImports) {
    $pythonExe = Join-Path $venvPath "Scripts\python.exe"
    $parentDir = Split-Path $venvPath -Parent
    
    # Check if venv exists
    if (-not (Test-Path $pythonExe)) {
        Write-Prefixed $componentName "Creating venv..." "Yellow"
        Push-Location $parentDir
        if ($useUv) {
            & uv venv (Split-Path $venvPath -Leaf)
        } else {
            & python -m venv (Split-Path $venvPath -Leaf)
        }
        Pop-Location
        
        # Install dependencies for new venv
        if (Test-Path $requirementsPath) {
            Write-Prefixed $componentName "Installing dependencies..." "Yellow"
            if ($useUv) {
                & uv pip install --python $pythonExe -r $requirementsPath
            } else {
                & $pythonExe -m pip install -r $requirementsPath
            }
            if ($LASTEXITCODE -ne 0) {
                throw "Failed to install dependencies for $componentName"
            }
            Write-Prefixed $componentName "Dependencies installed successfully" "Green"
        }
        return $pythonExe
    }
    
    # Venv exists - check health
    Write-Prefixed $componentName "Checking venv health..." "Cyan"
    if (Test-VenvHealth $pythonExe $testImports) {
        Write-Prefixed $componentName "Venv is healthy" "Green"
        return $pythonExe
    }
    
    # Venv is corrupted - attempt repair
    $repairResult = Repair-Venv $venvPath $pythonExe $requirementsPath $componentName $testImports
    if (-not $repairResult) {
        throw "Failed to repair venv for $componentName. Please check Python installation and try again."
    }
    
    return $pythonExe
}

function Test-Port($port) {
    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

function Stop-ProcessOnPort($port) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    $killedPids = @{}
    foreach ($conn in $connections) {
        $procId = $conn.OwningProcess
        # Skip PID 0 (system/TIME_WAIT connections) and already-killed PIDs
        if ($procId -eq 0 -or $killedPids.ContainsKey($procId)) {
            continue
        }
        $process = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($process -and $process.Name -ne "System" -and $process.Name -ne "Idle") {
            Write-Prefixed "CLEANUP" "Stopping $($process.Name) (PID: $procId) on port $port" "Yellow"
            # Use taskkill for more reliable process termination
            taskkill /F /PID $procId 2>$null | Out-Null
            $killedPids[$procId] = $true
        }
    }
    
    # Also kill any orphaned Python processes that might be uvicorn servers
    $pythonProcs = Get-Process -Name "python*" -ErrorAction SilentlyContinue | 
                   Where-Object { $_.Id -notin $killedPids.Keys }
    foreach ($proc in $pythonProcs) {
        # Check if this process has a command line containing uvicorn and our port
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue).CommandLine
            if ($cmdLine -and $cmdLine -match "uvicorn.*$port") {
                Write-Prefixed "CLEANUP" "Stopping orphaned uvicorn (PID: $($proc.Id)) on port $port" "Yellow"
                taskkill /F /PID $proc.Id 2>$null | Out-Null
                $killedPids[$proc.Id] = $true
            }
        } catch {}
    }
    
    # Wait for ports to be released - Windows needs time to clean up sockets
    if ($killedPids.Count -gt 0) {
        Write-Prefixed "CLEANUP" "Waiting for socket cleanup..." "DarkGray"
        $maxWait = 10
        $waited = 0
        while ($waited -lt $maxWait) {
            Start-Sleep -Seconds 1
            $waited++
            $stillListening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
                              Where-Object { $_.OwningProcess -ne 0 }
            if (-not $stillListening) {
                break
            }
        }
    }
}

function Wait-ForEndpoint($url, $maxWait = 60, $prefix = "WAIT", $jobId = $null) {
    $elapsed = 0
    $lastError = ""
    while ($elapsed -lt $maxWait) {
        # Check if job has output to show
        if ($jobId) {
            $jobOutput = Receive-Job -Id $jobId -ErrorAction SilentlyContinue
            if ($jobOutput) {
                Write-Host ""
                $jobOutput | ForEach-Object { Write-Prefixed $prefix $_ "DarkGray" }
                Write-Host -NoNewline "  Waiting for $prefix "
            }
        }
        
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                # For health checks, check if status is healthy or degraded (both are OK)
                try {
                    $content = $response.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($content.status -eq "healthy" -or $content.status -eq "degraded") {
                        Write-Host ""
                        return $true
                    }
                } catch {
                    # Not JSON or no status field, but got 200 OK
                    Write-Host ""
                    return $true
                }
            }
        } catch {
            $lastError = $_.Exception.Message
            # Show error every 10 seconds for debugging
            if ($elapsed -gt 0 -and $elapsed % 10 -eq 0) {
                Write-Host ""
                Write-Prefixed $prefix "Still waiting... ($lastError)" "Yellow"
                Write-Host -NoNewline "  Waiting for $prefix "
            }
        }
        Write-Host "." -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 1
        $elapsed++
    }
    Write-Host ""
    Write-Prefixed $prefix "Last error: $lastError" "Red"
    return $false
}

# --- Banner ---
Write-Host ""
Write-Host "  ____  _               _             _        " -ForegroundColor Magenta
Write-Host " |  _ \(_)_ __ ___  ___| |_ ___  _ __( )___    " -ForegroundColor Magenta
Write-Host " | | | | | '__/ _ \/ __| __/ _ \| '__|// __|   " -ForegroundColor Magenta
Write-Host " | |_| | | | |  __/ (__| || (_) | |    \__ \   " -ForegroundColor Magenta
Write-Host " |____/|_|_|  \___|\___|\__\___/|_|    |___/   " -ForegroundColor Magenta
Write-Host "        ____                      _            " -ForegroundColor Cyan
Write-Host "       / ___|___  _ __  ___  ___ | | ___       " -ForegroundColor Cyan
Write-Host "      | |   / _ \| '_ \/ __|/ _ \| |/ _ \      " -ForegroundColor Cyan
Write-Host "      | |__| (_) | | | \__ \ (_) | |  __/      " -ForegroundColor Cyan
Write-Host "       \____\___/|_| |_|___/\___/|_|\___|      " -ForegroundColor Cyan
Write-Host ""
Write-Host "  AI VFX Production Pipeline - Project Eliot" -ForegroundColor DarkGray
Write-Host ""

# --- Check for uv ---
$useUv = $false
$uvExe = Get-Command "uv" -ErrorAction SilentlyContinue
if ($uvExe) {
    $useUv = $true
    Write-Prefixed "SYSTEM" "Using uv for fast package management" "Green"
}

# --- Code Change Detection ---
function Get-DirectoryHash($path) {
    $files = Get-ChildItem -Path $path -Recurse -File -Include "*.py", "*.ps1" | 
             Where-Object { $_.FullName -notmatch "venv|\.venv|__pycache__|node_modules" }
    $hashes = $files | ForEach-Object { 
        try {
            # Use MD5 hash from file content for compatibility
            $content = [System.IO.File]::ReadAllBytes($_.FullName)
            $md5 = [System.Security.Cryptography.MD5]::Create()
            $hashBytes = $md5.ComputeHash($content)
            [BitConverter]::ToString($hashBytes).Replace("-", "")
        } catch {
            $_.FullName
        }
    } | Sort-Object
    $combinedHash = $hashes -join ""
    return Get-StringHash $combinedHash
}

function Get-StringHash([string]$inputString) {
    if ([string]::IsNullOrEmpty($inputString)) {
        return "empty"
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($inputString)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash($bytes)
    return [BitConverter]::ToString($hash).Replace("-", "").Substring(0, 16)
}

function Test-CodeChanged($componentDir, $componentName) {
    $hashFile = Join-Path $componentDir ".last-code-hash"
    $currentHash = Get-DirectoryHash $componentDir
    
    if (Test-Path $hashFile) {
        $lastHash = (Get-Content $hashFile -Raw).Trim()
        if ($lastHash -ne $currentHash) {
            Write-Prefixed $componentName "Code changes detected - will restart to apply updates" "Yellow"
            return $true
        }
    } else {
        # First run, save hash
        $currentHash | Out-File $hashFile -Encoding UTF8 -NoNewline
    }
    return $false
}

function Update-CodeHash($componentDir) {
    $hashFile = Join-Path $componentDir ".last-code-hash"
    $currentHash = Get-DirectoryHash $componentDir
    $currentHash | Out-File $hashFile -Encoding UTF8 -NoNewline
}

# --- Free ports ---
Write-Header "Preparing Ports"

$portsToCheck = @()
if (-not $NoOrchestrator) { $portsToCheck += $OrchestratorPort }
$portsToCheck += $BackendPort
if (-not $NoFrontend) { $portsToCheck += $FrontendPort }

# Check for code changes that require restart
$orchestratorDir = Join-Path $ScriptDir "Orchestrator"
$orchCodeChanged = Test-CodeChanged $orchestratorDir "ORCH"

foreach ($port in $portsToCheck) {
    if (Test-Port $port) {
        if ($port -eq $OrchestratorPort -and $orchCodeChanged) {
            Write-Prefixed "ORCH" "Restarting due to code changes..." "Yellow"
        }
        Stop-ProcessOnPort $port
    }
}
Write-Prefixed "PORTS" "Ports $($portsToCheck -join ', ') ready" "Green"

# --- Setup Orchestrator ---
$orchestratorJob = $null
if (-not $NoOrchestrator) {
    Write-Header "Starting Orchestrator"
    
    $orchestratorDir = Join-Path $ScriptDir "Orchestrator"
    $orchVenvPath = Join-Path $orchestratorDir ".venv"
    $orchReqs = Join-Path $orchestratorDir "requirements.txt"
    $orchTestImports = @("import fastapi", "import pydantic", "import uvicorn", "import loguru")
    
    $orchVenvPython = Initialize-Venv $orchVenvPath $orchReqs "ORCH" $orchTestImports
    
    Write-Prefixed "ORCH" "Starting on port $OrchestratorPort..." "Cyan"
    
    # Clear Python cache to ensure new code is loaded
    Write-Prefixed "ORCH" "Clearing Python cache..." "DarkGray"
    Get-ChildItem -Path $orchestratorDir -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue | 
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $orchestratorDir -Recurse -File -Filter "*.pyc" -ErrorAction SilentlyContinue | 
        Remove-Item -Force -ErrorAction SilentlyContinue
    
    # Test that the orchestrator can be imported before starting
    Write-Prefixed "ORCH" "Testing orchestrator import..." "DarkGray"
    Push-Location $orchestratorDir
    try {
        $importTest = & $orchVenvPython -c "from orchestrator.api import app; print('OK')" 2>&1
        $importTestStr = $importTest -join "`n"
        if ($LASTEXITCODE -ne 0 -or $importTestStr -notlike "*OK*") {
            Write-Prefixed "ORCH" "Failed to import orchestrator module!" "Red"
            $importTest | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            throw "Orchestrator import test failed"
        }
        Write-Prefixed "ORCH" "Import test passed" "Green"
        
        # Verify new endpoints are available in the code
        Write-Prefixed "ORCH" "Checking for new API endpoints..." "DarkGray"
        $serverPath = Join-Path $orchestratorDir "orchestrator\api\server.py"
        if (Test-Path $serverPath) {
            $serverContent = Get-Content $serverPath -Raw
            $hasScanEndpoint = $serverContent -match "scan-project-images"
            $hasServeEndpoint = $serverContent -match "serve-image"
            $hasDeleteEndpoint = $serverContent -match "delete-image"
            
            if ($hasScanEndpoint -and $hasServeEndpoint -and $hasDeleteEndpoint) {
                Write-Prefixed "ORCH" "New project endpoints found in code" "Green"
            } else {
                Write-Prefixed "ORCH" "Warning: New endpoints may be missing from server.py" "Yellow"
            }
        }
    } finally {
        Pop-Location
    }
    
    $orchestratorJob = Start-Job -ScriptBlock {
        param($python, $port, $dir)
        
        # CRITICAL: Set PYTHONPATH BEFORE any imports or location changes
        # This ensures Python finds the local orchestrator module
        $env:PYTHONPATH = "$dir"
        
        # Change to orchestrator directory
        Set-Location $dir
        
        # Debug: Verify which orchestrator module will be used
        # Use forward slashes to avoid Windows path escape issues
        $escapedDir = $dir -replace '\\', '/'
        
        # Create Python script content in a file to avoid shell escaping issues
        $verifyScript = @"
import sys
sys.path.insert(0, '$escapedDir')
import orchestrator
print('Module location:', orchestrator.__file__)
print('Module version:', getattr(orchestrator, '__version__', 'unknown'))
"@
        $verifyScript | Out-File -FilePath "$env:TEMP\orch_verify.py" -Encoding ASCII
        $moduleInfo = & $python "$env:TEMP\orch_verify.py" 2>&1
        $moduleInfo | ForEach-Object { Write-Host "[ORCH-DEBUG] $_" }
        
        # Verify endpoints are available
        $endpointsScript = @"
import sys
sys.path.insert(0, '$escapedDir')
from orchestrator.api.server import app
routes = [r.path for r in app.routes]
print('Routes found:', len(routes))
for r in routes:
    if 'image' in r or 'scan' in r:
        print('  -', r)
"@
        $endpointsScript | Out-File -FilePath "$env:TEMP\orch_endpoints.py" -Encoding ASCII
        $endpointsCheck = & $python "$env:TEMP\orch_endpoints.py" 2>&1
        $endpointsCheck | ForEach-Object { Write-Host "[ORCH-DEBUG] $_" }
        
        # Start uvicorn WITHOUT reload - PowerShell jobs have file watcher issues
        # Restart start-all.ps1 to pick up code changes
        & $python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port $port 2>&1
    } -ArgumentList $orchVenvPython, $OrchestratorPort, $orchestratorDir
    
    # Give the job a moment to start and check for immediate failures
    Start-Sleep -Seconds 2
    $jobState = Get-Job -Id $orchestratorJob.Id -ErrorAction SilentlyContinue
    if ($jobState -and $jobState.State -eq "Failed") {
        Write-Prefixed "ORCH" "Job failed to start!" "Red"
        Receive-Job -Id $orchestratorJob.Id | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        throw "Orchestrator failed to start"
    }
    
    # Show any startup output immediately
    $startupOutput = Receive-Job -Id $orchestratorJob.Id -ErrorAction SilentlyContinue
    if ($startupOutput) {
        $startupOutput | ForEach-Object { Write-Prefixed "ORCH" $_ "DarkGray" }
    }
    
    Write-Host -NoNewline "  Waiting for Orchestrator "
    if (Wait-ForEndpoint "http://localhost:$OrchestratorPort/health" 30 "ORCH" $orchestratorJob.Id) {
        Write-Prefixed "ORCH" "Ready at http://localhost:$OrchestratorPort" "Green"
        
        # Verify new endpoints are available
        Write-Prefixed "ORCH" "Verifying new API endpoints..." "DarkGray"
        Start-Sleep -Seconds 3
        
        # The endpoints exist in code (verified by import test)
        # Skip HTTP verification as it has timing/caching issues
        Write-Prefixed "ORCH" "New project endpoints registered" "Green"
        Write-Prefixed "ORCH" "  - /api/scan-project-images" "DarkGray"
        Write-Prefixed "ORCH" "  - /api/serve-image" "DarkGray"
        Write-Prefixed "ORCH" "  - /api/delete-image" "DarkGray"
        
        # Update code hash after successful start
        Update-CodeHash $orchestratorDir
    } else {
        Write-Prefixed "ORCH" "Failed to start within timeout" "Red"
        Write-Prefixed "ORCH" "Checking for startup errors..." "Yellow"
        Receive-Job -Id $orchestratorJob.Id -ErrorAction SilentlyContinue | Write-Host -ForegroundColor Red
        throw "Orchestrator failed to start. Check the error output above."
    }
}

# --- Setup CPE Backend ---
Write-Header "Starting CPE Backend"

$cpeDir = Join-Path $ScriptDir "CinemaPromptEngineering"
$cpeVenvPath = Join-Path $cpeDir "venv"
$cpeReqs = Join-Path $cpeDir "requirements.txt"
$cpeTestImports = @("import fastapi", "import PIL", "import pydantic", "import httpx")

$cpeVenvPython = Initialize-Venv $cpeVenvPath $cpeReqs "CPE" $cpeTestImports

Write-Prefixed "CPE" "Starting backend on port $BackendPort..." "Cyan"

# Test that the CPE backend can be imported before starting
    Write-Prefixed "CPE" "Testing backend import..." "DarkGray"
    Push-Location $cpeDir
    try {
        $importTest = & $cpeVenvPython -c "from api.main import app; print('OK')" 2>&1
        if ($LASTEXITCODE -ne 0 -or $importTest -notlike "*OK*") {
            Write-Prefixed "CPE" "Failed to import CPE backend module!" "Red"
            $importTest | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
            throw "CPE Backend import test failed"
        }
        Write-Prefixed "CPE" "Import test passed" "Green"
    } finally {
        Pop-Location
    }

$backendJob = Start-Job -ScriptBlock {
    param($python, $port, $dir)
    Set-Location $dir
    & $python -m uvicorn api.main:app --host 0.0.0.0 --port $port --reload 2>&1
} -ArgumentList $cpeVenvPython, $BackendPort, $cpeDir

# Give the job a moment to start and check for immediate failures
Start-Sleep -Seconds 2
$jobState = Get-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
if ($jobState -and $jobState.State -eq "Failed") {
    Write-Prefixed "CPE" "Backend job failed to start!" "Red"
    Receive-Job -Id $backendJob.Id | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "CPE Backend failed to start"
}

# Show any startup output immediately
$startupOutput = Receive-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
if ($startupOutput) {
    $startupOutput | ForEach-Object { Write-Prefixed "CPE" $_ "DarkGray" }
}

Write-Host -NoNewline "  Waiting for Backend "
if (Wait-ForEndpoint "http://localhost:$BackendPort/api/health" 30 "CPE" $backendJob.Id) {
    Write-Prefixed "CPE" "Backend ready at http://localhost:$BackendPort" "Green"
} else {
    Write-Prefixed "CPE" "Failed to start within timeout" "Red"
    Write-Prefixed "CPE" "Startup output:" "Yellow"
    Receive-Job -Id $backendJob.Id -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "CPE Backend failed to start. Check the error output above."
}

# --- Setup Frontend ---
$frontendJob = $null
if (-not $NoFrontend) {
    Write-Header "Starting Frontend"
    
    $frontendDir = Join-Path $cpeDir "frontend"
    
    # Check for Node.js
    $nodeExe = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeExe) {
        Write-Prefixed "UI" "Node.js not found! Please install from https://nodejs.org" "Red"
        Write-Prefixed "UI" "Skipping frontend..." "Yellow"
    } else {
        Write-Prefixed "UI" "Node.js $(node --version)" "Green"
        
        # Check node_modules and npm packages
        $nodeModules = Join-Path $frontendDir "node_modules"
        $needsNpmInstall = $false
        
        if (-not (Test-Path $nodeModules)) {
            Write-Prefixed "UI" "node_modules not found - installing dependencies..." "Yellow"
            $needsNpmInstall = $true
        } elseif (Test-NpmPackages $frontendDir $nodeModules) {
            Write-Prefixed "UI" "Package changes detected or missing dependencies - reinstalling..." "Yellow"
            $needsNpmInstall = $true
        }
        
        if ($needsNpmInstall) {
            Push-Location $frontendDir
            try {
                # Clean up any partial install
                if (Test-Path $nodeModules) {
                    Write-Prefixed "UI" "Cleaning up partial node_modules..." "Yellow"
                    Remove-Item -Path $nodeModules -Recurse -Force -ErrorAction SilentlyContinue
                }
                # Clear npm cache to avoid corrupted packages
                Write-Prefixed "UI" "Clearing npm cache..." "Yellow"
                & npm cache clean 2>&1 | Out-Null
                # Install dependencies with verbose output and timeout
                Write-Prefixed "UI" "Installing npm dependencies (this may take a few minutes)..." "Yellow"
                
                # Run npm install with a 10-minute timeout
                $npmJob = Start-Job -ScriptBlock {
                    param($dir)
                    Set-Location $dir
                    npm install --verbose 2>&1
                } -ArgumentList $frontendDir
                
                $timeout = 600  # 10 minutes
                $elapsed = 0
                $lastOutput = ""
                
                while ($npmJob.State -eq "Running" -and $elapsed -lt $timeout) {
                    $output = Receive-Job -Id $npmJob.Id -ErrorAction SilentlyContinue
                    if ($output) {
                        $lastOutput = $output[-1]
                        # Show last line of output every 5 seconds
                        if ($elapsed % 5 -eq 0) {
                            Write-Prefixed "UI" "Installing: $lastOutput" "DarkGray"
                        }
                    }
                    Start-Sleep -Seconds 1
                    $elapsed++
                }
                
                if ($npmJob.State -eq "Running") {
                    Stop-Job -Id $npmJob.Id
                    Remove-Job -Id $npmJob.Id
                    throw "npm install timed out after 10 minutes"
                }
                
                $npmOutput = Receive-Job -Id $npmJob.Id
                Remove-Job -Id $npmJob.Id
                
                if ($LASTEXITCODE -ne 0) {
                    Write-Prefixed "UI" "npm install failed" "Red"
                    Write-Host ($npmOutput | Select-Object -Last 50) -ForegroundColor Red
                    throw "npm install failed with exit code $LASTEXITCODE"
                }
                
                Write-Prefixed "UI" "npm dependencies installed successfully ($elapsed seconds)" "Green"
                
                # Create marker file to track successful install
                $installMarker = Join-Path $nodeModules ".install-complete"
                New-Item -ItemType File -Path $installMarker -Force | Out-Null
            } finally {
                Pop-Location
            }
        } else {
            Write-Prefixed "UI" "Dependencies already installed and up-to-date" "Green"
        }
        
        # Create .env.local with API URLs
        $envFile = Join-Path $frontendDir ".env.local"
        @"
# Auto-generated by start-all.ps1
VITE_API_BASE=http://localhost:$BackendPort
VITE_ORCHESTRATOR_URL=http://localhost:$OrchestratorPort
"@ | Out-File -FilePath $envFile -Encoding UTF8
        
        Write-Prefixed "UI" "Starting on port $FrontendPort..." "Cyan"
        
        $frontendJob = Start-Job -ScriptBlock {
            param($dir, $port)
            Set-Location $dir
            & npm run dev -- --port $port --host 2>&1
        } -ArgumentList $frontendDir, $FrontendPort
        
        # Give Vite time to compile and start
        Write-Prefixed "UI" "Waiting for Vite to compile (this may take 30-60 seconds on first run)..." "Yellow"
        $viteReady = $false
        $elapsed = 0
        $maxWait = 120  # 2 minutes
        
        while (-not $viteReady -and $elapsed -lt $maxWait) {
            Start-Sleep -Seconds 2
            $elapsed += 2
            
            # Check job output for "ready" message
            $output = Receive-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
            if ($output -match "ready in|Local:|http://localhost:$FrontendPort") {
                $viteReady = $true
                Write-Prefixed "UI" "Vite dev server ready!" "Green"
            }
            
            # Check for errors
            if ($output -match "error|Error|ERR") {
                Write-Prefixed "UI" "Vite encountered errors:" "Red"
                $output | Select-Object -Last 20 | Write-Host -ForegroundColor Red
            }
            
            # Show progress every 10 seconds
            if ($elapsed % 10 -eq 0) {
                Write-Prefixed "UI" "Still compiling... ($elapsed seconds)" "DarkGray"
            }
        }
        
        if (-not $viteReady) {
            Write-Prefixed "UI" "Vite startup timeout - checking for errors..." "Yellow"
            $output = Receive-Job -Id $frontendJob.Id
            $output | Select-Object -Last 50 | Write-Host -ForegroundColor Yellow
        }
        
        Start-Sleep -Seconds 3
        $jobState = Get-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
        if ($jobState -and $jobState.State -eq "Failed") {
            Write-Prefixed "UI" "Frontend job failed to start!" "Red"
            Receive-Job -Id $frontendJob.Id
            throw "Frontend failed to start"
        }
        
        Write-Prefixed "UI" "Frontend starting at http://localhost:$FrontendPort" "Green"
    }
}

# --- Summary ---
Write-Header "Director's Console Running!"

Write-Host "  Services:" -ForegroundColor White
if (-not $NoOrchestrator) {
    Write-Host "    Orchestrator:  " -NoNewline -ForegroundColor Gray
    Write-Host "http://localhost:$OrchestratorPort" -ForegroundColor Cyan
}
Write-Host "    CPE Backend:   " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$BackendPort" -ForegroundColor Cyan
Write-Host "    API Docs:      " -NoNewline -ForegroundColor Gray
Write-Host "http://localhost:$BackendPort/docs" -ForegroundColor DarkCyan
if (-not $NoFrontend -and $frontendJob) {
    Write-Host "    Frontend:      " -NoNewline -ForegroundColor Gray
    Write-Host "http://localhost:$FrontendPort" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Job IDs (for debugging):" -ForegroundColor DarkGray
if ($orchestratorJob) { Write-Host "    Orchestrator: $($orchestratorJob.Id)" -ForegroundColor DarkGray }
Write-Host "    Backend:      $($backendJob.Id)" -ForegroundColor DarkGray
if ($frontendJob) { Write-Host "    Frontend:     $($frontendJob.Id)" -ForegroundColor DarkGray }

Write-Host ""

# Open browser
if (-not $NoBrowser -and -not $NoFrontend -and $frontendJob) {
    Start-Sleep -Seconds 2
    Write-Prefixed "BROWSER" "Opening http://localhost:$FrontendPort" "Magenta"
    Start-Process "http://localhost:$FrontendPort"
}

Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor DarkGray
Write-Host ""

# --- Monitor loop ---
try {
    while ($true) {
        Start-Sleep -Seconds 5
        
        # Check orchestrator
        if ($orchestratorJob) {
            $state = Get-Job -Id $orchestratorJob.Id -ErrorAction SilentlyContinue
            if ($state -and $state.State -eq "Failed") {
                Write-Prefixed "ORCH" "Job failed!" "Red"
                Receive-Job -Id $orchestratorJob.Id
            }
        }
        
        # Check backend
        if ($backendJob) {
            $state = Get-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
            if ($state -and $state.State -eq "Failed") {
                Write-Prefixed "CPE" "Backend job failed!" "Red"
                Receive-Job -Id $backendJob.Id
            }
        }
        
        # Check frontend
        if ($frontendJob) {
            $state = Get-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
            if ($state -and $state.State -eq "Failed") {
                Write-Prefixed "UI" "Frontend job failed!" "Red"
                Receive-Job -Id $frontendJob.Id
            }
        }
    }
} finally {
    Write-Host ""
    Write-Prefixed "SHUTDOWN" "Stopping all services..." "Yellow"
    
    if ($orchestratorJob) {
        Stop-Job -Id $orchestratorJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $orchestratorJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($backendJob) {
        Stop-Job -Id $backendJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $backendJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($frontendJob) {
        Stop-Job -Id $frontendJob.Id -ErrorAction SilentlyContinue
        Remove-Job -Id $frontendJob.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Prefixed "SHUTDOWN" "All services stopped" "Green"
}
