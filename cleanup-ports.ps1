# Cleanup script for stale port bindings
$pids = @(68684, 107124, 73888, 41136, 15476)
foreach ($p in $pids) {
    $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "Killing existing process $p ($($proc.Name))"
        Stop-Process -Id $p -Force
    } else {
        Write-Host "PID $p does not exist"
    }
}

# Kill any Python processes that might be orphaned uvicorn servers
Get-Process -Name "python*" -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)" -ErrorAction SilentlyContinue).CommandLine
        if ($cmdLine -and $cmdLine -match "uvicorn") {
            Write-Host "Killing orphaned uvicorn process $($_.Id)"
            Stop-Process -Id $_.Id -Force
        }
    } catch {}
}

Write-Host "Waiting 5 seconds for socket cleanup..."
Start-Sleep -Seconds 5

Write-Host "`nPort 8020 status:"
netstat -ano | Select-String ':8020.*LISTEN'

Write-Host "`nDone. Run start-all.ps1 now."
