"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "./page.module.css";

// --- Types ---

interface HistoryItem {
  id: string;
  text: string;
  textSnippet: string;
  timestamp: number;
  duration: number;
  modelUsed: string;
  speaker?: string;
  audioBase64: string;
}

interface ChunkProgress {
  current: number;
  total: number;
  elapsed: number;
  estimatedRemaining: number;
  status: string;
}

// --- LocalStorage helpers ---

const HISTORY_KEY = "tts-history";
const MAX_HISTORY = 20;
const MAX_STORAGE_BYTES = 4 * 1024 * 1024;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    let list = items.slice(0, MAX_HISTORY);
    while (JSON.stringify(list).length > MAX_STORAGE_BYTES && list.length > 1) {
      list = list.slice(0, -1);
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded — silently fail
  }
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// --- Component ---

export default function Home() {
  // Form
  const [text, setText] = useState("");
  const [voiceSample, setVoiceSample] = useState<File | null>(null);
  const [speaker, setSpeaker] = useState("p225");
  const [speakers, setSpeakers] = useState<{ id: string; label: string; name: string; gender: string }[]>([]);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const [modelUsed, setModelUsed] = useState("");

  // Audio
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // History
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const waveformDataRef = useRef<Float32Array | null>(null);

  const LARGE_TEXT_THRESHOLD = 2000;
  const isLargeText = text.length > LARGE_TEXT_THRESHOLD;
  const useVoiceCloning = !!voiceSample;

  // --- Effects ---

  useEffect(() => {
    setHistory(loadHistory());
    fetch("/api/voices")
      .then((r) => r.json())
      .then((data) => {
        if (data.speakers?.length) setSpeakers(data.speakers);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // --- Audio events ---

  const onTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      drawPlayhead(audioRef.current.currentTime, audioRef.current.duration);
    }
  }, []);

  const onLoadedMetadata = useCallback(() => {
    if (audioRef.current) setAudioDuration(audioRef.current.duration);
  }, []);

  const onPlay = useCallback(() => setIsPlaying(true), []);
  const onPause = useCallback(() => setIsPlaying(false), []);
  const onEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // --- Waveform ---

  function drawWaveform(arrayBuffer: ArrayBuffer) {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioCtx
      .decodeAudioData(arrayBuffer.slice(0))
      .then((audioBuffer) => {
        const channel = audioBuffer.getChannelData(0);
        waveformDataRef.current = channel;
        renderWaveform(channel, 0);
        audioCtx.close();
      })
      .catch(() => {});
  }

  function renderWaveform(channel: Float32Array, playProgress: number) {
    const canvas = waveformRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const barWidth = 2;
    const gap = 1;
    const bars = Math.floor(w / (barWidth + gap));
    const samplesPerBar = Math.floor(channel.length / bars);

    for (let i = 0; i < bars; i++) {
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channel.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      const barH = Math.max(2, max * h * 0.85);
      const x = i * (barWidth + gap);
      const y = (h - barH) / 2;
      const progress = i / bars;

      if (progress <= playProgress) {
        ctx.fillStyle = "rgba(99, 102, 241, 0.9)";
      } else {
        ctx.fillStyle = "rgba(99, 102, 241, 0.25)";
      }
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1);
      ctx.fill();
    }
  }

  function drawPlayhead(time: number, duration: number) {
    if (!waveformDataRef.current || !duration) return;
    renderWaveform(waveformDataRef.current, time / duration);
  }

  function handleWaveformClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!audioRef.current || !audioDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    audioRef.current.currentTime = pct * audioDuration;
  }

  // --- File helpers ---

  async function buildBase64FromFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        if (typeof data !== "string") return reject(new Error("Failed to read file"));
        resolve(data.split(",").pop() ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // --- Save to history ---

  function addToHistory(textContent: string, model: string, duration: number, b64Audio: string) {
    const item: HistoryItem = {
      id: crypto.randomUUID(),
      text: textContent,
      textSnippet: textContent.slice(0, 80).replace(/\n/g, " "),
      timestamp: Date.now(),
      duration,
      modelUsed: model,
      speaker: useVoiceCloning ? undefined : speaker,
      audioBase64: b64Audio,
    };
    const updated = [item, ...history];
    setHistory(updated);
    setActiveHistoryId(item.id);
    saveHistory(updated);
  }

  // --- Play audio ---

  function setAudioFromBase64(b64: string) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(url);
    setAudioBase64(b64);
    setCurrentTime(0);
    drawWaveform(bytes.buffer.slice(0));
    setTimeout(() => audioRef.current?.play().catch(() => {}), 50);
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
  }

  // --- Submit handlers ---

  async function handleStreamingSubmit(voiceSampleBase64: string | null) {
    const abortController = new AbortController();
    abortRef.current = abortController;
    setChunkProgress({ current: 0, total: 0, elapsed: 0, estimatedRemaining: 0, status: "Starting..." });

    const resp = await fetch("/api/tts/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "en", speaker, voiceSampleBase64 }),
      signal: abortController.signal,
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error ?? `Server returned ${resp.status}`);
    }

    const reader = resp.body?.getReader();
    if (!reader) throw new Error("No response stream");

    const decoder = new TextDecoder();
    let buffer = "";
    let resultModel = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let event: Record<string, unknown>;
        try { event = JSON.parse(line.slice(6).trim()); } catch { continue; }

        switch (event.type) {
          case "start":
            resultModel = (event.model as string) || "";
            setModelUsed(resultModel);
            setChunkProgress({ current: 0, total: event.totalChunks as number, elapsed: 0, estimatedRemaining: 0, status: `Processing 0/${event.totalChunks} chunks...` });
            break;
          case "progress":
            setChunkProgress({
              current: event.chunk as number,
              total: event.totalChunks as number,
              elapsed: event.elapsed as number,
              estimatedRemaining: event.estimatedRemaining as number,
              status: `Processing ${event.chunk}/${event.totalChunks} chunks... ~${formatTime(event.estimatedRemaining as number)} left`,
            });
            break;
          case "concatenating":
            setChunkProgress((prev) => prev ? { ...prev, status: "Combining audio..." } : prev);
            break;
          case "complete": {
            const model = (event.model as string) || resultModel;
            setModelUsed(model);
            setChunkProgress((prev) => prev ? { ...prev, current: prev.total, status: `Done in ${formatTime(event.totalTime as number)}` } : prev);
            const b64 = event.audioBase64 as string;
            setAudioBase64(b64);
            setAudioFromBase64(b64);

            // Get duration from audio element after it loads
            const checkDuration = () => {
              const dur = audioRef.current?.duration;
              if (dur && isFinite(dur)) {
                addToHistory(text, model, dur, b64);
              } else {
                setTimeout(checkDuration, 200);
              }
            };
            setTimeout(checkDuration, 300);
            break;
          }
          case "error":
            throw new Error(event.message as string);
        }
      }
    }
  }

  async function handleDirectSubmit(voiceSampleBase64: string | null) {
    const resp = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker, voiceSampleBase64 }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => null);
      throw new Error(body?.error ?? `Server returned ${resp.status}`);
    }

    const model = resp.headers.get("x-tts-model") || (useVoiceCloning ? "xtts_v2" : "vits");
    setModelUsed(model);

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(url);

    const b64 = await blobToBase64(blob);
    setAudioBase64(b64);
    drawWaveform(await blob.arrayBuffer());
    setTimeout(() => {
      audioRef.current?.play().catch(() => {});
      const checkDuration = () => {
        const dur = audioRef.current?.duration;
        if (dur && isFinite(dur)) {
          addToHistory(text, model, dur, b64);
        } else {
          setTimeout(checkDuration, 200);
        }
      };
      setTimeout(checkDuration, 300);
    }, 50);
  }

  function handleCancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setChunkProgress(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || loading) return;
    setError(null);
    setChunkProgress(null);
    setLoading(true);
    setActiveHistoryId(null);

    try {
      const voiceSampleBase64 = voiceSample ? await buildBase64FromFile(voiceSample) : null;
      if (isLargeText) {
        await handleStreamingSubmit(voiceSampleBase64);
      } else {
        await handleDirectSubmit(voiceSampleBase64);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  // --- History actions ---

  function playHistoryItem(item: HistoryItem) {
    setActiveHistoryId(item.id);
    setModelUsed(item.modelUsed);
    setError(null);
    setChunkProgress(null);
    setAudioFromBase64(item.audioBase64);
    setShowSidebar(false);
  }

  function deleteHistoryItem(id: string) {
    const updated = history.filter((h) => h.id !== id);
    setHistory(updated);
    saveHistory(updated);
    if (activeHistoryId === id) setActiveHistoryId(null);
  }

  function downloadAudio(b64: string, filename: string) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/wav" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
    setActiveHistoryId(null);
  }

  // --- Render ---

  return (
    <div className={styles.app}>
      {/* Mobile sidebar overlay */}
      <div
        className={`${styles.sidebarOverlay} ${showSidebar ? styles.sidebarOverlayVisible : ""}`}
        onClick={() => setShowSidebar(false)}
      />

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${showSidebar ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarHeader}>
          <h2>History</h2>
          {history.length > 0 && (
            <button className={styles.clearBtn} onClick={clearHistory}>
              Clear all
            </button>
          )}
        </div>
        <div className={styles.historyList}>
          {history.length === 0 ? (
            <p className={styles.emptyHistory}>
              Generated audio will appear here
            </p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`${styles.historyItem} ${activeHistoryId === item.id ? styles.historyItemActive : ""}`}
                onClick={() => playHistoryItem(item)}
              >
                <p className={styles.historyText}>{item.textSnippet}</p>
                <div className={styles.historyMeta}>
                  <span>{formatRelativeTime(item.timestamp)}</span>
                  <span>{formatDuration(item.duration)}</span>
                  <span className={`${styles.badge} ${item.modelUsed === "vits" ? styles.badgeVits : styles.badgeXtts}`}>
                    {item.modelUsed === "vits" ? "Fast" : "Clone"}
                  </span>
                  <div className={styles.historyActions}>
                    <button
                      className={styles.historyActionBtn}
                      onClick={(e) => { e.stopPropagation(); downloadAudio(item.audioBase64, `tts-${item.id.slice(0, 8)}.wav`); }}
                    >
                      DL
                    </button>
                    <button
                      className={`${styles.historyActionBtn} ${styles.historyDeleteBtn}`}
                      onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }}
                    >
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Mobile toggle */}
      <button className={styles.sidebarToggle} onClick={() => setShowSidebar(!showSidebar)}>
        {showSidebar ? "\u2715" : "\u2630"}
      </button>

      {/* Main */}
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>VoiceCraft</h1>
          <p>Text-to-speech with voice cloning. Upload a voice sample for cloning, or use a built-in voice for instant results.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} autoComplete="off">
          {/* Text input */}
          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter text to convert to speech..."
              rows={8}
              required
            />
            <span className={styles.charCount}>
              {text.length > 0 && (
                <>
                  {text.length.toLocaleString()} chars
                  {isLargeText && <> &middot; streaming</>}
                </>
              )}
            </span>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            {/* Speaker select (VITS) - only when no voice sample */}
            {!useVoiceCloning && speakers.length > 0 && (
              <select
                className={styles.select}
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value)}
              >
                {speakers.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            )}

            {/* Voice sample upload */}
            <div className={styles.uploadArea}>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                style={{ display: "none" }}
                onChange={(e) => setVoiceSample(e.target.files?.[0] ?? null)}
              />
              {voiceSample ? (
                <div className={styles.uploadFile}>
                  <span>{voiceSample.name}</span>
                  <button
                    type="button"
                    className={styles.removeFileBtn}
                    onClick={() => {
                      setVoiceSample(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  + Voice sample
                </button>
              )}
            </div>

            {/* Model indicator */}
            <div className={styles.modelIndicator}>
              <span className={`${styles.badge} ${useVoiceCloning ? styles.badgeXtts : styles.badgeVits}`}>
                {useVoiceCloning ? "XTTS-v2 Clone" : "VITS Fast"}
              </span>
            </div>

            {/* Generate / Cancel */}
            {loading && isLargeText ? (
              <button type="button" className={styles.cancelBtn} onClick={handleCancel}>
                Cancel
              </button>
            ) : (
              <button type="submit" className={styles.generateBtn} disabled={!text.trim() || loading}>
                {loading ? "Generating..." : "Generate"}
              </button>
            )}
          </div>

          {/* Progress */}
          {chunkProgress && chunkProgress.total > 0 && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressStatus}>{chunkProgress.status}</span>
                {chunkProgress.elapsed > 0 && (
                  <span className={styles.progressTime}>{formatTime(chunkProgress.elapsed)}</span>
                )}
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${(chunkProgress.current / chunkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && <div className={styles.error}>{error}</div>}
        </form>

        {/* Audio Player */}
        {audioUrl && (
          <div className={styles.player}>
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onPlay={onPlay}
              onPause={onPause}
              onEnded={onEnded}
            />
            <div className={styles.playerTop}>
              <button className={styles.playBtn} onClick={togglePlay} type="button">
                {isPlaying ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              <div className={styles.playerInfo}>
                <span className={styles.playerTime}>
                  {formatDuration(currentTime)} / {formatDuration(audioDuration)}
                </span>
                <span className={`${styles.playerModel} ${styles.badge} ${modelUsed === "vits" ? styles.badgeVits : styles.badgeXtts}`}>
                  {modelUsed === "vits" ? "VITS" : "XTTS-v2"}
                </span>
              </div>
              <div className={styles.playerActions}>
                {audioBase64 && (
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => downloadAudio(audioBase64, "voicecraft-output.wav")}
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
            <div className={styles.waveformWrap}>
              <canvas ref={waveformRef} onClick={handleWaveformClick} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
