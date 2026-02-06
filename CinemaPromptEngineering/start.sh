#!/bin/bash
# Cinema Prompt Engineering - Startup Script
# Starts both the backend API and frontend dev server using the virtual environment

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  Cinema Prompt Engineering - Starting..."
echo "============================================"
echo ""

# Check for virtual environment
if [ ! -f "venv/bin/python" ]; then
    echo "[ERROR] Virtual environment not found at: venv/"
    echo "Please run install.sh first to set up the application."
    exit 1
fi
echo "[OK] Virtual environment found"

# Check if Node is available
if ! command -v npm &> /dev/null; then
    echo "[ERROR] Node.js/npm is not installed or not in PATH"
    exit 1
fi
echo "[OK] Node.js/npm found"

echo ""
echo "[1/4] Killing existing processes on ports 8000 and 3000..."
# Kill processes on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
# Kill processes on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
echo "  Done"

# Clear Python cache
echo "  Clearing Python cache..."
rm -rf api/__pycache__ api/providers/__pycache__ cinema_rules/__pycache__ 2>/dev/null || true

echo "[2/4] Starting Backend API (port 8000)..."
# Use venv Python directly, clear PYTHONHOME/PYTHONPATH
export PYTHONHOME=
export PYTHONPATH=
./venv/bin/python -m uvicorn api.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "[3/4] Checking frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
if [ ! -d "node_modules" ]; then
    echo "  Installing npm dependencies..."
    npm install
fi
echo "  Done"

echo "[4/4] Starting Frontend Dev Server (port 3000)..."
npm run dev &
FRONTEND_PID=$!

cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  Both servers starting!"
echo "============================================"
echo ""
echo "  Backend API:  http://localhost:8000"
echo "  Frontend UI:  http://localhost:3000"
echo "  API Docs:     http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo "============================================"
echo ""

# Wait for backend to be ready
echo "Waiting for servers to start..."
sleep 3

# Try to open browser
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3000" 2>/dev/null &
elif command -v open &> /dev/null; then
    open "http://localhost:3000" 2>/dev/null &
fi

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
