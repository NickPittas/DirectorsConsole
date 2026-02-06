# Cinema Prompt Engineering - Installation & Build Guide

This document covers how to install, run, and build standalone installers for the Cinema Prompt Engineering application.

---

## Table of Contents

1. [Quick Start (Development)](#quick-start-development)
2. [Full Installation](#full-installation)
3. [Building Standalone Installers](#building-standalone-installers)
4. [Troubleshooting](#troubleshooting)

---

## Quick Start (Development)

### Prerequisites
- **Python 3.10+** - [Download](https://python.org)
- **Node.js 18+** - [Download](https://nodejs.org)

### Windows
```powershell
# Clone or download the repository
cd CinemaPromptEngineering

# Install and run
.\install.ps1   # One-time setup
.\run.ps1       # Start the application
```

### macOS / Linux
```bash
# Clone or download the repository
cd CinemaPromptEngineering

# Make scripts executable
chmod +x install.sh run.sh

# Install and run
./install.sh    # One-time setup
./run.sh        # Start the application
```

The application will open in your browser at `http://localhost:3000` (dev mode) or `http://localhost:8000` (production mode).

---

## Full Installation

### Step 1: Install Prerequisites

#### Windows
1. Download and install Python 3.10+ from https://python.org
   - **Important**: Check "Add Python to PATH" during installation
2. Download and install Node.js 18+ from https://nodejs.org

#### macOS
```bash
# Using Homebrew
brew install python@3.10
brew install node@18
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip nodejs npm
```

### Step 2: Run Installation Script

The installation script will:
- Create a Python virtual environment
- Install all Python dependencies
- Install all Node.js dependencies
- Build the frontend for production

#### Windows
Double-click `install.bat` or run in PowerShell:
```powershell
.\install.ps1
```

#### macOS / Linux
```bash
chmod +x install.sh
./install.sh
```

### Step 3: Run the Application

#### Windows
Double-click `run.bat` or run in PowerShell:
```powershell
.\run.ps1
```

#### macOS / Linux
```bash
./run.sh
```

### What Gets Installed

```
CinemaPromptEngineering/
├── venv/                    # Python virtual environment (created)
├── frontend/
│   └── node_modules/        # Node.js dependencies (created)
└── ComfyCinemaPrompting/
    └── web/
        └── app/             # Built frontend (created)
```

---

## Building Standalone Installers

You can build a standalone executable that bundles everything together - no Python or Node.js required on the target machine.

### Prerequisites for Building

All prerequisites from the installation step, plus the installation must be complete:
```
# Windows
.\install.ps1

# macOS/Linux
./install.sh
```

### Build for Windows

```powershell
# Run the build script
.\build_installer.ps1

# Or use the batch file
.\build_installer.bat
```

**Output**: `dist/CinemaPromptEngineering-Windows/`

To create a distributable ZIP:
```powershell
Compress-Archive -Path "dist\CinemaPromptEngineering-Windows" -DestinationPath "dist\CinemaPromptEngineering-Windows.zip"
```

### Build for macOS

Run on a Mac (cross-compilation not supported):
```bash
chmod +x build_installer.sh
./build_installer.sh
```

**Output**: `dist/CinemaPromptEngineering-macOS/`

To create a distributable archive:
```bash
cd dist
zip -r CinemaPromptEngineering-macOS.zip CinemaPromptEngineering-macOS
```

### Build for Linux

```bash
chmod +x build_installer.sh
./build_installer.sh
```

**Output**: `dist/CinemaPromptEngineering-Linux/`

To create a distributable archive:
```bash
cd dist
tar -czvf CinemaPromptEngineering-Linux.tar.gz CinemaPromptEngineering-Linux
```

### Distributing the Installer

The built application can be distributed as-is:

1. **Windows**: Share the `CinemaPromptEngineering-Windows.zip` file
   - Users extract and run `CinemaPromptEngineering.exe`

2. **macOS**: Share the `CinemaPromptEngineering-macOS.zip` file
   - Users extract and run `./CinemaPromptEngineering` or `./start.sh`
   - May need to allow in System Preferences > Security & Privacy

3. **Linux**: Share the `CinemaPromptEngineering-Linux.tar.gz` file
   - Users extract and run `./CinemaPromptEngineering` or `./start.sh`

---

## Project Structure

```
CinemaPromptEngineering/
├── api/                     # FastAPI backend
│   ├── main.py             # Main API routes
│   └── providers/          # LLM provider integrations
├── cinema_rules/           # Core rule engine
│   ├── schemas/            # Pydantic models
│   ├── rules/              # Validation rules
│   ├── presets/            # Film & animation presets
│   └── prompts/            # Prompt generator
├── frontend/               # React/Vite frontend
│   ├── src/
│   └── package.json
├── ComfyCinemaPrompting/   # ComfyUI integration
├── requirements.txt        # Python dependencies
├── install.ps1/bat/sh      # Installation scripts
├── run.ps1/bat/sh          # Run scripts
├── build_installer.*       # Build scripts
└── cinema_prompt.spec      # PyInstaller configuration
```

---

## Troubleshooting

### "Python is not installed or not in PATH"

**Windows**: Reinstall Python and check "Add Python to PATH"  
**macOS/Linux**: Ensure `python3` is accessible:
```bash
which python3
# If not found, install via package manager
```

### "Node.js/npm is not installed or not in PATH"

Download from https://nodejs.org and reinstall, ensuring it's added to PATH.

### "Virtual environment not found"

Run the installation script first:
```
# Windows: .\install.ps1
# macOS/Linux: ./install.sh
```

### Port Already in Use

The application uses ports 8000 (backend) and 3000 (frontend dev server). If these are busy:

**Windows PowerShell**:
```powershell
# Find process on port 8000
netstat -ano | findstr :8000
# Kill by PID
taskkill /PID <pid> /F
```

**macOS/Linux**:
```bash
# Find and kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

### Frontend Build Fails

Ensure Node.js is version 18+:
```bash
node --version
```

Delete `node_modules` and reinstall:
```bash
cd frontend
rm -rf node_modules
npm install
```

### PyInstaller Build Fails

1. Ensure the virtual environment is activated
2. Try with verbose output:
```bash
python -m PyInstaller --clean --noconfirm --debug all cinema_prompt.spec
```

### macOS Security Warning

When running the built application on macOS, you may see "cannot be opened because the developer cannot be verified":

1. Right-click (or Control-click) the application
2. Select "Open" from the menu
3. Click "Open" in the dialog

Or in System Preferences > Security & Privacy > General, click "Open Anyway".

---

## Manual Installation (Without Scripts)

If you prefer manual installation:

### Backend Setup
```bash
cd CinemaPromptEngineering

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\activate
# Activate (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend
python -m uvicorn api.main:app --reload --port 8000
```

### Frontend Setup (separate terminal)
```bash
cd CinemaPromptEngineering/frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Or build for production
npm run build
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Backend server port |
| `VITE_API_BASE` | `/api` | API base URL for frontend |
| `BUILD_MODE` | `comfyui` | Build target: `standalone` or `comfyui` |

---

## Support

For issues and feature requests, visit:
https://github.com/NickPittas/CinemaPromptEngineering/issues
