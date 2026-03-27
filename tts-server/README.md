# Coqui XTTS-v2 TTS Server

A local Text-to-Speech server with voice cloning capabilities using Coqui XTTS-v2.

## Features

- 🎤 **Voice Cloning**: Clone any voice with just a 6-10 second audio sample
- 🌍 **Multilingual**: Supports 16+ languages including English, Spanish, French, German, Chinese, Japanese, and more
- 🚀 **Fast**: Runs locally on your machine (GPU accelerated if available)
- 🆓 **Free**: No API costs, completely open source

## Requirements

- Python 3.9 or higher
- 4GB+ RAM (8GB+ recommended)
- GPU with CUDA support (optional, but recommended for faster generation)

## Installation

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

The startup script will:

1. Create a Python virtual environment
2. Install all required dependencies
3. Start the TTS server on port 5000

## First Run

⚠️ **Important**: On first run, the script will download the XTTS-v2 model (~2GB). This may take several minutes depending on your internet connection.

## API Endpoints

### POST /tts

Generate speech from text with optional voice cloning.

**Request Body:**

```json
{
  "text": "Hello, this is a test of voice cloning!",
  "language": "en",
  "voiceSampleBase64": "data:audio/wav;base64,..." // optional
}
```

**Response:** Audio file (WAV format)

### GET /health

Check server health and status.

**Response:**

```json
{
  "status": "healthy",
  "model": "xtts_v2",
  "device": "cuda",
  "model_loaded": true
}
```

### GET /voices

Get information about supported languages and voice cloning.

## Supported Languages

- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Italian (it)
- Portuguese (pt)
- Polish (pl)
- Turkish (tr)
- Russian (ru)
- Dutch (nl)
- Czech (cs)
- Arabic (ar)
- Chinese (zh-cn)
- Japanese (ja)
- Hungarian (hu)
- Korean (ko)

## Voice Cloning Tips

For best voice cloning results:

- Use a 6-10 second clear audio sample
- Ensure minimal background noise
- Use a sample with natural speech (not shouting or whispering)
- WAV or MP3 format recommended

## Troubleshooting

### Model Download Issues

If the model download fails, try:

```bash
pip install --upgrade TTS
```

### CUDA/GPU Issues

If you have a GPU but it's not being detected:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### Memory Issues

If you run out of memory, try:

- Closing other applications
- Using shorter text inputs
- Disabling GPU (will be slower but use less memory)

## Performance

- **CPU**: ~5-10 seconds per sentence
- **GPU**: ~1-2 seconds per sentence

## License

This server uses Coqui TTS, which is licensed under MPL 2.0.
