FROM python:3.11-slim AS backend-deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng libsndfile1 build-essential git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY tts-server/requirements.txt ./tts-server/requirements.txt
RUN pip install --no-cache-dir -r tts-server/requirements.txt

# Copy server code and download script
COPY tts-server/server.py ./tts-server/server.py
COPY tts-server/download_models.py ./tts-server/download_models.py

# Pre-download models during build so they're baked into the image
RUN python tts-server/download_models.py

# --- Node.js for frontend ---
FROM node:20-slim AS frontend-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app/ ./app/
COPY public/ ./public/
COPY next.config.ts tsconfig.json ./

RUN npm run build

# --- Final image ---
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    espeak-ng libsndfile1 curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy Python deps from backend stage
COPY --from=backend-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-deps /usr/local/bin /usr/local/bin
COPY --from=backend-deps /app/tts-server /app/tts-server

# Copy Next.js standalone build
COPY --from=frontend-build /app/.next/standalone /app/frontend
COPY --from=frontend-build /app/.next/static /app/frontend/.next/static
COPY --from=frontend-build /app/public /app/frontend/public

# Startup script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENV PORT=7860
EXPOSE 7860

CMD ["/app/start.sh"]
