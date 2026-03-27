# ⚡ Quick Start Guide

Get up and running in 3 steps!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start TTS Server

### macOS/Linux

```bash
cd tts-server
chmod +x start.sh
./start.sh
```

### Windows

```cmd
cd tts-server
start.bat
```

**⏳ Wait for**: "✅ XTTS-v2 model loaded successfully!"

**⚠️ First time?** Model download takes 5-10 minutes (~2GB)

## Step 3: Start Next.js App

**Open a NEW terminal** (keep TTS server running):

```bash
npm run dev
```

## 🎉 You're Ready!

Open: **http://localhost:3000**

---

## 🎤 Try Voice Cloning

1. Click "Upload Voice Sample"
2. Record or upload 6-10 seconds of clear audio
3. Enter text to synthesize
4. Click "Generate Speech"
5. Listen to your cloned voice!

---

## 🆘 Problems?

### TTS Server Not Starting?

```bash
cd tts-server
python3 -m pip install --upgrade pip
pip install -r requirements.txt
python server.py
```

### Connection Error?

- Make sure TTS server is running (check terminal)
- Test: `curl http://localhost:5000/health`

### Need More Help?

- See [SETUP.md](SETUP.md) for detailed guide
- Check [README.md](README.md) for troubleshooting

---

**That's it!** 🚀
