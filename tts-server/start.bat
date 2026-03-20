@echo off
REM Coqui XTTS-v2 TTS Server Startup Script for Windows

echo 🚀 Starting Coqui XTTS-v2 TTS Server...

REM Check if virtual environment exists
if not exist "venv\" (
    echo 📦 Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo 🔧 Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade dependencies
echo 📥 Installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Set environment variables
set PORT=5001

REM Start the server
echo ✅ Starting server on port %PORT%...
python server.py
