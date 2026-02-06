#!/bin/bash
# Cinema Prompt Engineering - macOS/Linux Installer Builder
# Creates a standalone executable using PyInstaller

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "======================================================="
echo "  Cinema Prompt Engineering - Build macOS/Linux Installer"
echo "======================================================="
echo ""

# Check for virtual environment
if [ ! -f "venv/bin/python" ]; then
    echo "[ERROR] Virtual environment not found. Please run install.sh first."
    exit 1
fi

VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"

# Step 1: Install PyInstaller
echo "[1/5] Installing PyInstaller..."
# Use python -m pip to avoid shebang path issues
$VENV_PYTHON -m pip install pyinstaller
if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to install PyInstaller"
    exit 1
fi
echo "  Done"

# Step 2: Build Frontend
echo "[2/5] Building frontend for standalone mode..."
cd "$SCRIPT_DIR/frontend"

# Install cross-env if not present
npm install cross-env --save-dev 2>/dev/null

# Install terser if not present
npm install terser --save-dev 2>/dev/null

# Build for standalone
npm run build:standalone
if [ $? -ne 0 ]; then
    echo "[ERROR] Frontend build failed"
    cd "$SCRIPT_DIR"
    exit 1
fi
echo "  Done"
cd "$SCRIPT_DIR"

# Step 3: Prepare static files for bundling
echo "[3/5] Preparing static files..."
DIST_DIR="$SCRIPT_DIR/dist"
STATIC_DIR="$DIST_DIR/static"

# Create dist directory if it doesn't exist
if [ ! -d "$STATIC_DIR" ]; then
    echo "  [WARNING] Static files not found at expected location."
    echo "  Creating from ComfyUI build..."
    
    mkdir -p "$STATIC_DIR"
    
    if [ -d "$SCRIPT_DIR/ComfyCinemaPrompting/web/app" ]; then
        cp -r "$SCRIPT_DIR/ComfyCinemaPrompting/web/app/"* "$STATIC_DIR/"
    fi
fi
echo "  Done"

# Step 4: Run PyInstaller
echo "[4/5] Building executable with PyInstaller..."
echo "  This may take several minutes..."

# Run PyInstaller with the spec file (it auto-detects dist/static)
$VENV_PYTHON -m PyInstaller --clean --noconfirm "$SCRIPT_DIR/cinema_prompt.spec"
if [ $? -ne 0 ]; then
    echo "[ERROR] PyInstaller build failed"
    exit 1
fi

echo "  Done"

# Step 5: Package output
echo "[5/5] Packaging final output..."

# Determine OS name for output directory
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_NAME="macOS"
else
    OS_NAME="Linux"
fi

OUTPUT_DIR="$SCRIPT_DIR/dist/CinemaPromptEngineering-$OS_NAME"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy executable
cp "$SCRIPT_DIR/dist/CinemaPromptEngineering" "$OUTPUT_DIR/"

# Make executable
chmod +x "$OUTPUT_DIR/CinemaPromptEngineering"

# Create launcher script
cat > "$OUTPUT_DIR/start.sh" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
./CinemaPromptEngineering
EOF
chmod +x "$OUTPUT_DIR/start.sh"

# Create README
cat > "$OUTPUT_DIR/README.txt" << EOF
Cinema Prompt Engineering - $OS_NAME Standalone Application
==========================================================

To run the application:
1. Open Terminal and navigate to this directory
2. Run: ./start.sh
   Or: ./CinemaPromptEngineering
3. A browser window will open automatically
4. The application runs at http://localhost:8000

To stop the application:
- Press Ctrl+C in the terminal

System Requirements:
- macOS 10.15+ or Linux with glibc 2.17+
- No additional dependencies required (all bundled)

For support, visit: https://github.com/NickPittas/CinemaPromptEngineering
EOF

echo "  Done"

echo ""
echo "======================================================="
echo "  Build Complete!"
echo "======================================================="
echo ""
echo "  Output directory:"
echo "  $OUTPUT_DIR"
echo ""
echo "  To create a distributable archive:"
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "  cd dist && zip -r CinemaPromptEngineering-macOS.zip CinemaPromptEngineering-macOS"
else
    echo "  cd dist && tar -czvf CinemaPromptEngineering-Linux.tar.gz CinemaPromptEngineering-Linux"
fi
echo ""
