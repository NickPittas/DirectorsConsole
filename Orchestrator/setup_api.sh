#!/bin/bash
# Quick setup script for the Orchestrator API Server
# Usage: ./setup_api.sh

set -e

echo "=========================================="
echo "Director's Console Orchestrator"
echo "Phase 1: FastAPI Layer Setup"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "requirements.txt" ]; then
    echo "ERROR: requirements.txt not found"
    echo "Please run this script from the Orchestrator directory:"
    echo "  cd /mnt/nas/Python/DirectorsConsole/Orchestrator"
    echo "  ./setup_api.sh"
    exit 1
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found"
    echo "Please install Python 3.10+ first"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✓ Found Python $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo ""
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment exists"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip > /dev/null

# Install requirements
echo ""
echo "Installing dependencies..."
echo "(This may take a few minutes...)"
pip install -r requirements.txt > /dev/null 2>&1

echo "✓ Dependencies installed"

# Verify FastAPI installation
echo ""
echo "Verifying FastAPI installation..."
python3 -c "import fastapi; import uvicorn; print('✓ FastAPI and Uvicorn installed successfully')"

# Create config.yaml if it doesn't exist
if [ ! -f "config.yaml" ]; then
    if [ -f "config.example.yaml" ]; then
        echo ""
        echo "Creating config.yaml from config.example.yaml..."
        cp config.example.yaml config.yaml
        echo "✓ config.yaml created"
        echo "  (You may want to edit it to configure backends)"
    else
        echo ""
        echo "WARNING: No config.yaml or config.example.yaml found"
        echo "The server will fail to start without a config file"
    fi
else
    echo "✓ config.yaml exists"
fi

echo ""
echo "=========================================="
echo "✓ Setup Complete!"
echo "=========================================="
echo ""
echo "To start the API server:"
echo "  source venv/bin/activate"
echo "  python -m orchestrator.server"
echo ""
echo "To run tests:"
echo "  python test_api.py"
echo ""
echo "Interactive API docs will be at:"
echo "  http://127.0.0.1:8000/docs"
echo ""
echo "See docs/API.md for complete documentation"
echo ""
