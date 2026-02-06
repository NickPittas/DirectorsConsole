#!/bin/bash
# Director's Console - Docker Launcher
# Equivalent to: python start.py (but using Docker)

set -e

echo ""
echo "  ____  _               _             _       "
echo " |  _ \(_)_ __ ___  ___| |_ ___  _ __( )___   "
echo " | | | | | '__/ _ \/ __| __/ _ \| '__|// __|  "
echo " | |_| | | | |  __/ (__| || (_) | |    \__ \  "
echo " |____/|_|_|  \___|\___|\_/\___/|_|    |___/  "
echo "        ____                      _          "
echo "       / ___|___  _ __  ___  ___ | | ___     "
echo "      | |   / _ \| '_ \/ __|/ _ \| |/ _ \    "
echo "      | |__| (_) | | | \__ \ (_) | |  __/    "
echo "       \____\___/|_| |_|___/\___/|_|\___|    "
echo ""
echo "  AI VFX Production Pipeline - Docker Edition"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "[ERROR] Docker is not running. Please start Docker first."
    exit 1
fi

# Parse arguments
NO_ORCHESTRATOR=0
DETACHED=1

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --no-orchestrator) NO_ORCHESTRATOR=1 ;;
        --foreground|-f) DETACHED=0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

echo "[DOCKER] Building and starting services..."

# Build and start containers
if [ $NO_ORCHESTRATOR -eq 1 ]; then
    echo "[DOCKER] Starting CPE only (--no-orchestrator)"
    if [ $DETACHED -eq 1 ]; then
        docker-compose up -d --build cpe
    else
        docker-compose up --build cpe
    fi
else
    if [ $DETACHED -eq 1 ]; then
        docker-compose up -d --build
    else
        docker-compose up --build
    fi
fi

if [ $DETACHED -eq 1 ]; then
    echo ""
    echo "[SUCCESS] Services started!"
    echo ""
    echo "  Director's Console: http://localhost:8000"
    echo "  (Frontend + Backend served together - no separate port 5173)"
    [ $NO_ORCHESTRATOR -eq 0 ] && echo "  Orchestrator API:   http://localhost:8020"
    echo ""
    echo "  View logs: docker-compose logs -f"
    echo "  Stop:      docker-compose down"
    echo ""
    
    # Open browser (works on Linux and macOS)
    if command -v xdg-open > /dev/null; then
        xdg-open http://localhost:8000 &
    elif command -v open > /dev/null; then
        open http://localhost:8000
    fi
fi
