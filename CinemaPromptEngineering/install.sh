#!/bin/bash
# Cinema Prompt Engineering - macOS/Linux Installation Script
# Run this script once to set up the application

echo ""
echo "======================================================="
echo "  Cinema Prompt Engineering - macOS/Linux Installer"
echo "======================================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for Python
echo "[1/6] Checking Python installation..."
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 is not installed"
    echo "Please install Python 3.10+ from https://python.org or via Homebrew"
    exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "  Found: $PYTHON_VERSION"

# Check for Node.js
echo "[2/6] Checking Node.js installation..."
if ! command -v npm &> /dev/null; then
    echo "[ERROR] Node.js/npm is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org or via Homebrew"
    exit 1
fi

NODE_VERSION=$(node --version)
echo "  Found: Node.js $NODE_VERSION"

# Create virtual environment
echo "[3/6] Creating Python virtual environment..."
if [ -d "venv" ]; then
    echo "  Virtual environment already exists, skipping creation"
else
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to create virtual environment"
        exit 1
    fi
    echo "  Created: venv/"
fi

# Install Python dependencies
echo "[4/6] Installing Python dependencies..."
# Use python -m pip to avoid shebang path issues
./venv/bin/python -m pip install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install Python dependencies"
    exit 1
fi
echo "  Python dependencies installed"

# Install Node.js dependencies
echo "[5/6] Installing Node.js dependencies for frontend..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install npm dependencies"
    exit 1
fi
echo "  Frontend dependencies installed"

# Build frontend
echo "[6/6] Building frontend for production..."
npm run build
if [ $? -ne 0 ]; then
    echo "[WARNING] Frontend build failed, will use dev server instead"
else
    echo "  Frontend built successfully"
fi
cd ..

echo ""
echo "======================================================="
echo "  Installation Complete!"
echo "======================================================="
echo ""
echo "To start the application, run:"
echo "  ./run.sh"
echo ""
echo "Make sure to make it executable first:"
echo "  chmod +x run.sh"
echo ""
