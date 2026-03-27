# Python Version Compatibility Fix

## Issue

You have Python 3.13, but Coqui TTS currently only supports Python 3.9-3.11.

## Solutions

### Option 1: Install Python 3.11 (Recommended)

#### Using Homebrew (macOS)

```bash
# Install Python 3.11
brew install python@3.11

# Create virtual environment with Python 3.11
cd tts-server
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python server.py
```

#### Using pyenv (macOS/Linux)

```bash
# Install pyenv if not already installed
brew install pyenv  # macOS
# or curl https://pyenv.run | bash  # Linux

# Install Python 3.11
pyenv install 3.11.9

# Set Python 3.11 for this directory
cd tts-server
pyenv local 3.11.9

# Create virtual environment
python -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python server.py
```

### Option 2: Use Docker (Alternative)

Create a Docker container with the correct Python version:

```bash
cd tts-server
```

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 5000

CMD ["python", "server.py"]
```

Run with Docker:

```bash
docker build -t tts-server .
docker run -p 5000:5000 tts-server
```

### Option 3: Wait for TTS Update

The Coqui TTS team is working on Python 3.12+ support. You can:

1. Star/watch the repo: https://github.com/coqui-ai/TTS
2. Check for updates periodically
3. Use one of the above solutions in the meantime

## Quick Check Your Python Version

```bash
python3 --version
python3.11 --version  # Check if 3.11 is available
python3.10 --version  # Check if 3.10 is available
```

## Recommended: Install Python 3.11

```bash
# macOS with Homebrew
brew install python@3.11

# Then update start.sh to use python3.11
cd tts-server
# Edit start.sh to use python3.11 instead of python3
```

After installing Python 3.11, run:

```bash
cd tts-server
./start.sh
```
