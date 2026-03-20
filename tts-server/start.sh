#!/bin/bash

# Coqui XTTS-v2 TTS Server Startup Script

echo "🚀 Starting Coqui XTTS-v2 TTS Server..."

# Detect Python version
PYTHON_CMD=""

# Try to find Python 3.11, 3.10, or 3.9 (TTS requires 3.9-3.11)
if command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
    echo "✅ Found Python 3.11"
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD="python3.10"
    echo "✅ Found Python 3.10"
elif command -v python3.9 &> /dev/null; then
    PYTHON_CMD="python3.9"
    echo "✅ Found Python 3.9"
else
    # Fall back to python3, but warn user
    PYTHON_CMD="python3"
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | awk '{print $2}')
    echo "⚠️  Using $PYTHON_CMD (version $PYTHON_VERSION)"
    echo "⚠️  Coqui TTS requires Python 3.9-3.11"
    echo "⚠️  If installation fails, install Python 3.11:"
    echo "    brew install python@3.11"
    echo ""
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment with $PYTHON_CMD..."
    $PYTHON_CMD -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Verify Python version in venv
VENV_PYTHON_VERSION=$(python --version 2>&1 | awk '{print $2}')
echo "📍 Virtual environment Python version: $VENV_PYTHON_VERSION"

# Install/upgrade dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Installation failed!"
    echo "📖 See PYTHON_VERSION_FIX.md for solutions"
    echo ""
    echo "Quick fix: Install Python 3.11"
    echo "  brew install python@3.11"
    echo "  rm -rf venv"
    echo "  python3.11 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# Set environment variables
export PORT=5001

# Start the server
echo "✅ Starting server on port $PORT..."
python server.py
