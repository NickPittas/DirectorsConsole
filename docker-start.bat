@echo off
REM Director's Console - Docker Launcher
REM Equivalent to: .\venv\Scripts\python.exe .\start.py (but using Docker)

echo.
echo   ____  _               _             _       
echo  ^|  _ \(_)_ __ ___  ___^| ^|_ ___  _ __( )___  
echo  ^| ^| ^| ^| ^| '__/ _ \/ __^| __/ _ \^| '__^|// __^|  
echo  ^| ^|_^| ^| ^| ^| ^  __/ (__^| ^|^| (_) ^| ^|    \__ \  
echo  ^|____/^|_^|_^|  \___^|\___^|\__\___/^|_^|    ^|___/  
echo         ____                      _         
echo        / ___^|___  _ __  ___  ___ ^| ^| ___    
echo       ^| ^|   / _ \^| '_ \/ __^|/ _ \^| ^|/ _ \   
echo       ^| ^|__^| (_) ^| ^| ^| \__ \ (_) ^| ^|  __/   
echo        \____\___/^|_^| ^|_^|___/\___/^|_^|\___^|   
echo.
echo   AI VFX Production Pipeline - Docker Edition
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Parse arguments
set NO_ORCHESTRATOR=0
set NO_BUILD=0
set DETACHED=1

:parse_args
if "%~1"=="" goto done_args
if /i "%~1"=="--no-orchestrator" set NO_ORCHESTRATOR=1
if /i "%~1"=="--build" set NO_BUILD=0
if /i "%~1"=="--foreground" set DETACHED=0
if /i "%~1"=="-f" set DETACHED=0
shift
goto parse_args
:done_args

echo [DOCKER] Building and starting services...

REM Build and start containers
if %NO_ORCHESTRATOR%==1 (
    echo [DOCKER] Starting CPE only (--no-orchestrator)
    if %DETACHED%==1 (
        docker-compose up -d --build cpe
    ) else (
        docker-compose up --build cpe
    )
) else (
    if %DETACHED%==1 (
        docker-compose up -d --build
    ) else (
        docker-compose up --build
    )
)

if errorlevel 1 (
    echo [ERROR] Docker compose failed
    pause
    exit /b 1
)

if %DETACHED%==1 (
    echo.
    echo [SUCCESS] Services started!
    echo.
    echo   Director's Console: http://localhost:8000
    echo   (Frontend + Backend served together - no separate port 5173)
    if %NO_ORCHESTRATOR%==0 echo   Orchestrator API:   http://localhost:8020
    echo.
    echo   View logs: docker-compose logs -f
    echo   Stop:      docker-compose down
    echo.
    
    REM Open browser
    start http://localhost:8000
)
