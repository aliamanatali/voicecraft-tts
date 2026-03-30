#!/bin/bash
# Start Flask TTS server in background on port 5001
cd /app/tts-server
PORT=5001 python server.py &

# Wait for TTS server to be ready
echo "Waiting for TTS server..."
for i in $(seq 1 120); do
    if curl -s http://localhost:5001/health > /dev/null 2>&1; then
        echo "TTS server ready"
        break
    fi
    sleep 1
done

# Start Next.js frontend on port 7860
cd /app/frontend
LOCAL_TTS_SERVER_URL=http://localhost:5001 PORT=7860 HOSTNAME=0.0.0.0 node server.js
