# 🎤 Local TTS Setup Guide

This guide will help you set up the complete TTS system with Coqui XTTS-v2 for voice cloning.

## 📋 Prerequisites

- **Node.js** 18+ (for Next.js frontend)
- **Python** 3.9+ (for TTS server)
- **4GB+ RAM** (8GB+ recommended)
- **GPU with CUDA** (optional, but recommended for faster generation)

## 🚀 Quick Start

### Step 1: Install Next.js Dependencies

```bash
npm install
```

### Step 2: Start the TTS Server

#### macOS/Linux:

```bash
cd tts-server
chmod +x start.sh
./start.sh
```

#### Windows:

```cmd
cd tts-server
start.bat
```

**⚠️ First Run Note**: The TTS server will download the XTTS-v2 model (~2GB) on first run. This may take 5-10 minutes depending on your internet connection.

### Step 3: Start the Next.js Development Server

In a **new terminal** (keep the TTS server running):

```bash
npm run dev
```

### Step 4: Open the Application

Open your browser and navigate to:

```
http://localhost:3000
```

## 🎯 How to Use

### Basic Text-to-Speech

1. Enter text in the text area
2. Select language (default: English)
3. Click "Generate Speech"
4. Listen to the generated audio

### Voice Cloning

1. Click "Upload Voice Sample" or record your voice
2. Provide a 6-10 second clear audio sample
3. Enter the text you want to synthesize
4. Click "Generate Speech"
5. The system will clone the voice from your sample!

## 🔧 Configuration

### Environment Variables

Edit [`qwen-tts/.env`](qwen-tts/.env):

```env
# Local TTS Server URL
LOCAL_TTS_SERVER_URL=http://localhost:5000
```

### Change TTS Server Port

Edit [`tts-server/start.sh`](tts-server/start.sh) (or `start.bat` for Windows):

```bash
export PORT=5000  # Change to your desired port
```

Then update [`qwen-tts/.env`](qwen-tts/.env):

```env
LOCAL_TTS_SERVER_URL=http://localhost:YOUR_PORT
```

## 🌍 Supported Languages

- 🇬🇧 English (en)
- 🇪🇸 Spanish (es)
- 🇫🇷 French (fr)
- 🇩🇪 German (de)
- 🇮🇹 Italian (it)
- 🇵🇹 Portuguese (pt)
- 🇵🇱 Polish (pl)
- 🇹🇷 Turkish (tr)
- 🇷🇺 Russian (ru)
- 🇳🇱 Dutch (nl)
- 🇨🇿 Czech (cs)
- 🇸🇦 Arabic (ar)
- 🇨🇳 Chinese (zh-cn)
- 🇯🇵 Japanese (ja)
- 🇭🇺 Hungarian (hu)
- 🇰🇷 Korean (ko)

## 💡 Tips for Best Results

### Voice Cloning Tips

- Use a **6-10 second** clear audio sample
- Ensure **minimal background noise**
- Use natural speech (not shouting or whispering)
- WAV or MP3 format recommended
- Single speaker only in the sample

### Performance Tips

- **GPU**: ~1-2 seconds per sentence
- **CPU**: ~5-10 seconds per sentence
- Keep text under 500 characters for faster generation
- Close other applications if running out of memory

## 🐛 Troubleshooting

### TTS Server Won't Start

**Issue**: Python dependencies fail to install

**Solution**:

```bash
cd tts-server
python3 -m pip install --upgrade pip
pip install -r requirements.txt
```

### Model Download Fails

**Issue**: XTTS-v2 model download interrupted

**Solution**:

```bash
pip install --upgrade TTS
python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')"
```

### GPU Not Detected

**Issue**: Have GPU but server uses CPU

**Solution** (for CUDA 11.8):

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

For other CUDA versions, visit: https://pytorch.org/get-started/locally/

### Connection Error in Browser

**Issue**: "Cannot connect to local TTS server"

**Solution**:

1. Make sure the TTS server is running (check terminal)
2. Verify the server is on port 5000: `curl http://localhost:5000/health`
3. Check [`qwen-tts/.env`](qwen-tts/.env) has correct URL

### Out of Memory

**Issue**: Server crashes with memory error

**Solutions**:

- Close other applications
- Use shorter text inputs
- Restart the TTS server
- If on GPU, try CPU mode (slower but uses less memory)

## 📊 System Requirements

### Minimum

- CPU: 4 cores
- RAM: 4GB
- Storage: 5GB free space
- Internet: For initial model download

### Recommended

- CPU: 8+ cores
- RAM: 8GB+
- GPU: NVIDIA GPU with 4GB+ VRAM
- Storage: 10GB free space

## 🔒 Privacy & Security

- ✅ **100% Local**: All processing happens on your machine
- ✅ **No API Calls**: No data sent to external servers
- ✅ **No Tracking**: No analytics or telemetry
- ✅ **Open Source**: Full transparency

## 📝 Architecture

```
┌─────────────────┐
│   Next.js App   │  (Port 3000)
│   (Frontend)    │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Next.js API    │  (API Route)
│     /api/tts    │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  Python Flask   │  (Port 5000)
│   TTS Server    │
│  (XTTS-v2)      │
└─────────────────┘
```

## 🆘 Getting Help

If you encounter issues:

1. Check the TTS server terminal for error messages
2. Check the Next.js dev server terminal for errors
3. Check browser console (F12) for frontend errors
4. Review this troubleshooting guide
5. Check the [TTS server README](tts-server/README.md)

## 📚 Additional Resources

- [Coqui TTS Documentation](https://docs.coqui.ai/)
- [XTTS-v2 Model Card](https://huggingface.co/coqui/XTTS-v2)
- [Next.js Documentation](https://nextjs.org/docs)

## 🎉 You're All Set!

Enjoy your local TTS system with voice cloning capabilities!
