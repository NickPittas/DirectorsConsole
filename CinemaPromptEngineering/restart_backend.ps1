# Kill existing uvicorn processes and restart backend
Write-Host "Stopping existing backend processes..." -ForegroundColor Yellow

# Get processes listening on port 9800
$connections = netstat -ano | Select-String ":9800.*LISTENING"
$pids = @()
foreach ($conn in $connections) {
    $parts = $conn.Line -split '\s+'
    $processId = $parts[-1]
    if ($processId -match '^\d+$' -and $processId -ne '0') {
        $pids += $processId
    }
}

$pids = $pids | Sort-Object -Unique

foreach ($processId in $pids) {
    Write-Host "  Killing PID $processId" -ForegroundColor Gray
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

Write-Host "Starting backend on port 9800..." -ForegroundColor Green
Set-Location $PSScriptRoot
python -m uvicorn api.main:app --reload --port 9800
