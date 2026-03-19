"""
TTS Server — Hybrid VITS (fast) + XTTS-v2 (voice cloning)
Auto-selects model: voice sample → XTTS-v2, otherwise → VITS
"""

import os
import io
import json
import base64
import tempfile
import time
import threading
import shutil
import re
import numpy as np
import soundfile as sf
from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
import torch
import torchaudio

# torchaudio 2.10+ defaults to torchcodec which requires FFmpeg.
_original_torchaudio_load = torchaudio.load
def _patched_torchaudio_load(filepath, *args, **kwargs):
    try:
        return _original_torchaudio_load(filepath, *args, backend="soundfile", **kwargs)
    except Exception:
        data, sr = sf.read(filepath, dtype="float32")
        if data.ndim == 1:
            data = data[np.newaxis, :]
        else:
            data = data.T
        return torch.from_numpy(data), sr
torchaudio.load = _patched_torchaudio_load

from TTS.api import TTS
import logging
import warnings

warnings.filterwarnings('ignore')

# PyTorch 2.6+ defaults weights_only=True which breaks Coqui TTS model loading.
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
CORS(app)

# Device selection — MPS is slower than CPU for these models on Apple Silicon
if torch.cuda.is_available():
    device = "cuda"
else:
    device = "cpu"
logger.info(f"Using device: {device}")

# --- Load VITS (fast, built-in voices) ---
tts_vits = None
vits_speakers = []
try:
    logger.info("Loading VITS model (fast)...")
    tts_vits = TTS("tts_models/en/vctk/vits").to(device)
    vits_speakers = list(tts_vits.speakers) if hasattr(tts_vits, 'speakers') and tts_vits.speakers else []
    logger.info(f"VITS loaded — {len(vits_speakers)} speakers")
except Exception as e:
    logger.error(f"Failed to load VITS: {e}")

# --- Load XTTS-v2 (voice cloning) ---
tts_xtts = None
try:
    logger.info("Loading XTTS-v2 model (voice cloning)...")
    tts_xtts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    logger.info("XTTS-v2 loaded")
except Exception as e:
    logger.error(f"Failed to load XTTS-v2: {e}")


# --- Helpers ---

def _create_default_speaker_wav(path: str):
    sr = 22050
    t = np.linspace(0, 1.0, sr, endpoint=False)
    audio = 0.3 * np.sin(2 * np.pi * 220 * t).astype(np.float32)
    sf.write(path, audio, sr)


def _split_text_into_chunks(text, max_chars=800):
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        if current and len(current) + len(sentence) + 1 > max_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = current + " " + sentence if current else sentence
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _generate_chunk_vits(text_chunk, speaker_id, temp_dir, chunk_idx):
    output_path = os.path.join(temp_dir, f"chunk_{chunk_idx}.wav")
    tts_vits.tts_to_file(text=text_chunk, speaker=speaker_id, file_path=output_path)
    return output_path


def _generate_chunk_xtts(text_chunk, speaker_wav, language, temp_dir, chunk_idx):
    output_path = os.path.join(temp_dir, f"chunk_{chunk_idx}.wav")
    tts_xtts.tts_to_file(
        text=text_chunk, speaker_wav=speaker_wav,
        language=language, file_path=output_path
    )
    return output_path


def _concatenate_chunks(chunk_paths, output_path):
    all_audio = []
    sample_rate = None
    for path in chunk_paths:
        data_arr, sr = sf.read(path, dtype='float32')
        if sample_rate is None:
            sample_rate = sr
        all_audio.append(data_arr)
    combined = np.concatenate(all_audio)
    sf.write(output_path, combined, sample_rate)
    return output_path


# --- Routes ---

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "device": device,
        "models": {
            "vits": {"loaded": tts_vits is not None, "speakers": len(vits_speakers)},
            "xtts_v2": {"loaded": tts_xtts is not None}
        }
    })


# VCTK speaker metadata: id -> (label, gender, accent)
VCTK_SPEAKERS = {
    "p225": ("Emma", "F", "English"),
    "p226": ("Arthur", "M", "English"),
    "p227": ("Olivia", "F", "English"),
    "p228": ("James", "M", "English"),
    "p229": ("Sophie", "F", "English"),
    "p230": ("William", "M", "English"),
    "p231": ("Charlotte", "F", "English"),
    "p232": ("Henry", "M", "English"),
    "p233": ("Amelia", "F", "English"),
    "p234": ("George", "M", "Scottish"),
    "p236": ("Isabella", "F", "English"),
    "p237": ("Thomas", "M", "Scottish"),
    "p238": ("Lily", "F", "Northern Irish"),
    "p239": ("Jack", "M", "English"),
    "p240": ("Grace", "F", "English"),
    "p241": ("Oscar", "M", "Scottish"),
    "p243": ("Mia", "F", "English"),
    "p244": ("Daniel", "M", "English"),
    "p245": ("Ruby", "F", "Irish"),
    "p246": ("Noah", "M", "Scottish"),
    "p247": ("Ella", "F", "English"),
    "p248": ("Liam", "M", "English"),
    "p249": ("Ava", "F", "Scottish"),
    "p250": ("Jacob", "M", "English"),
    "p251": ("Chloe", "F", "Indian"),
    "p252": ("Ethan", "M", "Scottish"),
    "p253": ("Lucy", "F", "Welsh"),
    "p254": ("Logan", "M", "English"),
    "p255": ("Hannah", "F", "English"),
    "p256": ("Leo", "M", "English"),
    "p257": ("Zoe", "F", "English"),
    "p258": ("Aiden", "M", "English"),
    "p259": ("Freya", "F", "English"),
    "p260": ("Ryan", "M", "Irish"),
    "p261": ("Daisy", "F", "Northern Irish"),
    "p262": ("Owen", "M", "Scottish"),
    "p263": ("Ivy", "F", "English"),
    "p264": ("Luke", "M", "English"),
    "p265": ("Poppy", "F", "Scottish"),
    "p266": ("Finn", "M", "Irish"),
    "p267": ("Alice", "F", "English"),
    "p268": ("Nathan", "M", "English"),
    "p269": ("Rosie", "F", "English"),
    "p270": ("Caleb", "M", "Scottish"),
    "p271": ("Maisie", "F", "English"),
    "p272": ("Dylan", "M", "Scottish"),
    "p273": ("Evie", "F", "English"),
    "p274": ("Max", "M", "English"),
    "p275": ("Sienna", "F", "Irish"),
    "p276": ("Kai", "M", "English"),
    "p277": ("Isla", "F", "English"),
    "p278": ("Adam", "M", "English"),
    "p279": ("Layla", "F", "English"),
    "p280": ("Cole", "M", "Scottish"),
    "p281": ("Millie", "F", "Scottish"),
    "p282": ("Alex", "M", "Irish"),
    "p283": ("Phoebe", "F", "English"),
    "p284": ("Sam", "M", "English"),
    "p285": ("Amber", "F", "English"),
    "p286": ("Marcus", "M", "English"),
    "p287": ("Ellie", "F", "English"),
    "p288": ("Ian", "M", "Irish"),
    "p292": ("Nora", "F", "Northern Irish"),
    "p293": ("Felix", "M", "Scottish"),
    "p294": ("Clara", "F", "English"),
    "p295": ("Miles", "M", "Irish"),
    "p297": ("Vera", "F", "English"),
    "p298": ("Colin", "M", "Irish"),
    "p299": ("Nina", "F", "English"),
    "p300": ("Hugo", "M", "English"),
    "p301": ("Fiona", "F", "English"),
    "p302": ("Seth", "M", "English"),
    "p303": ("Cara", "F", "English"),
    "p304": ("Rick", "M", "Northern Irish"),
    "p305": ("Tara", "F", "English"),
    "p306": ("Nigel", "M", "English"),
    "p307": ("Suki", "F", "Indian"),
    "p308": ("Roy", "M", "English"),
    "p310": ("Priya", "F", "Indian"),
    "p311": ("Raj", "M", "Indian"),
    "p312": ("Mei", "F", "English"),
    "p313": ("Dev", "M", "English"),
    "p314": ("Ling", "F", "English"),
    "p316": ("Chen", "M", "English"),
    "p317": ("Anika", "F", "English"),
    "p318": ("Ravi", "M", "English"),
    "p323": ("Kara", "F", "English"),
    "p326": ("Grant", "M", "English"),
    "p329": ("Flora", "F", "English"),
    "p330": ("Keith", "M", "English"),
    "p333": ("Rita", "F", "English"),
    "p334": ("Clive", "M", "Scottish"),
    "p335": ("Deepa", "F", "Indian"),
    "p336": ("Ali", "M", "English"),
    "p339": ("Sita", "F", "English"),
    "p340": ("Vince", "M", "English"),
    "p341": ("Uma", "F", "English"),
    "p343": ("Zara", "F", "English"),
    "p345": ("Rowan", "M", "English"),
    "p347": ("Leah", "F", "English"),
    "p351": ("Kirk", "M", "English"),
    "p360": ("Elena", "F", "English"),
    "p361": ("Bruce", "M", "English"),
    "p362": ("Jaya", "F", "English"),
    "p363": ("Ned", "M", "English"),
    "p364": ("Tess", "F", "English"),
    "p374": ("Samir", "M", "English"),
    "p376": ("Rina", "F", "English"),
}


@app.route('/voices', methods=['GET'])
def list_voices():
    labeled = []
    for sid in vits_speakers:
        if sid in VCTK_SPEAKERS:
            name, gender, accent = VCTK_SPEAKERS[sid]
            labeled.append({
                "id": sid,
                "name": name,
                "label": f"{name} ({gender}, {accent})",
                "gender": gender,
                "accent": accent,
            })
    # Sort: females first, then males, alphabetically within
    labeled.sort(key=lambda x: (0 if x["gender"] == "F" else 1, x["name"]))
    return jsonify({
        "speakers": labeled,
        "xtts_languages": [
            "en", "es", "fr", "de", "it", "pt", "pl", "tr",
            "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko"
        ]
    })


@app.route('/tts', methods=['POST'])
def text_to_speech():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "Missing required field: text"}), 400

        text = data['text']
        language = data.get('language', 'en')
        voice_sample_base64 = data.get('voiceSampleBase64')
        speaker_id = data.get('speaker', 'p225')
        use_cloning = bool(voice_sample_base64)

        if use_cloning and tts_xtts is None:
            return jsonify({"error": "XTTS-v2 model not loaded"}), 500
        if not use_cloning and tts_vits is None:
            return jsonify({"error": "VITS model not loaded"}), 500

        model_name = "xtts_v2" if use_cloning else "vits"
        logger.info(f"TTS Request: model={model_name}, text_length={len(text)}, speaker={speaker_id}")

        with tempfile.TemporaryDirectory() as temp_dir:
            if use_cloning:
                audio_data = base64.b64decode(
                    voice_sample_base64.split(',')[1] if ',' in voice_sample_base64 else voice_sample_base64
                )
                speaker_wav = os.path.join(temp_dir, "reference.wav")
                with open(speaker_wav, 'wb') as f:
                    f.write(audio_data)

            chunks = _split_text_into_chunks(text, max_chars=800)
            logger.info(f"Split into {len(chunks)} chunk(s)")

            chunk_paths = []
            for idx, chunk in enumerate(chunks):
                logger.info(f"Chunk {idx + 1}/{len(chunks)} ({len(chunk)} chars)")
                if use_cloning:
                    path = _generate_chunk_xtts(chunk, speaker_wav, language, temp_dir, idx)
                else:
                    path = _generate_chunk_vits(chunk, speaker_id, temp_dir, idx)
                chunk_paths.append(path)

            output_path = os.path.join(temp_dir, "output.wav")
            _concatenate_chunks(chunk_paths, output_path)

            with open(output_path, 'rb') as f:
                audio_bytes = f.read()

            logger.info(f"Done: {len(audio_bytes)} bytes, {len(chunks)} chunks")

            resp = send_file(
                io.BytesIO(audio_bytes),
                mimetype='audio/wav',
                as_attachment=False,
                download_name='speech.wav'
            )
            resp.headers['X-TTS-Model'] = model_name
            return resp

    except Exception as e:
        logger.error(f"TTS generation failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/tts/stream', methods=['POST'])
def text_to_speech_stream():
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "Missing required field: text"}), 400

        text = data['text']
        language = data.get('language', 'en')
        voice_sample_base64 = data.get('voiceSampleBase64')
        speaker_id = data.get('speaker', 'p225')
        use_cloning = bool(voice_sample_base64)

        if use_cloning and tts_xtts is None:
            return jsonify({"error": "XTTS-v2 model not loaded"}), 500
        if not use_cloning and tts_vits is None:
            return jsonify({"error": "VITS model not loaded"}), 500

        model_name = "xtts_v2" if use_cloning else "vits"
        logger.info(f"TTS Stream: model={model_name}, text_length={len(text)}")

        def generate():
            try:
                temp_dir = tempfile.mkdtemp()
                start_time = time.time()

                if use_cloning:
                    audio_data = base64.b64decode(
                        voice_sample_base64.split(',')[1] if ',' in voice_sample_base64 else voice_sample_base64
                    )
                    speaker_wav = os.path.join(temp_dir, "reference.wav")
                    with open(speaker_wav, 'wb') as f:
                        f.write(audio_data)

                chunks = _split_text_into_chunks(text, max_chars=800)
                total_chunks = len(chunks)

                yield f"data: {json.dumps({'type': 'start', 'totalChunks': total_chunks, 'totalChars': len(text), 'model': model_name})}\n\n"

                chunk_paths = []
                for idx, chunk in enumerate(chunks):
                    chunk_start = time.time()
                    logger.info(f"Stream chunk {idx + 1}/{total_chunks} ({len(chunk)} chars)")

                    result = [None, None]
                    def run_chunk(ci=idx, ct=chunk):
                        try:
                            if use_cloning:
                                result[0] = _generate_chunk_xtts(ct, speaker_wav, language, temp_dir, ci)
                            else:
                                result[0] = _generate_chunk_vits(ct, speaker_id, temp_dir, ci)
                        except Exception as ex:
                            result[1] = ex

                    t = threading.Thread(target=run_chunk)
                    t.start()
                    while t.is_alive():
                        t.join(timeout=5)
                        if t.is_alive():
                            yield f": keepalive\n\n"

                    if result[1]:
                        raise result[1]
                    chunk_paths.append(result[0])

                    chunk_duration = time.time() - chunk_start
                    elapsed = time.time() - start_time
                    avg = elapsed / (idx + 1)
                    remaining = avg * (total_chunks - idx - 1)

                    yield f"data: {json.dumps({'type': 'progress', 'chunk': idx + 1, 'totalChunks': total_chunks, 'chunkDuration': round(chunk_duration, 1), 'elapsed': round(elapsed, 1), 'estimatedRemaining': round(remaining, 1)})}\n\n"

                yield f"data: {json.dumps({'type': 'concatenating'})}\n\n"

                output_path = os.path.join(temp_dir, "output.wav")
                _concatenate_chunks(chunk_paths, output_path)

                with open(output_path, 'rb') as f:
                    audio_bytes = f.read()

                audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
                total_time = time.time() - start_time

                logger.info(f"Stream complete: {len(audio_bytes)} bytes, {total_chunks} chunks, {total_time:.1f}s")

                yield f"data: {json.dumps({'type': 'complete', 'audioBase64': audio_b64, 'audioSize': len(audio_bytes), 'totalTime': round(total_time, 1), 'totalChunks': total_chunks, 'model': model_name})}\n\n"

                shutil.rmtree(temp_dir, ignore_errors=True)

            except Exception as e:
                logger.error(f"TTS stream failed: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        return Response(generate(), mimetype='text/event-stream', headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        })

    except Exception as e:
        logger.error(f"TTS stream request failed: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    logger.info(f"Starting TTS server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
