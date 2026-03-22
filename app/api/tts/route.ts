import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 600; // allow up to 10 minutes for long texts

const LOCAL_TTS_SERVER = process.env.LOCAL_TTS_SERVER_URL || "http://localhost:5001";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text;
    const voiceSampleBase64 = body?.voiceSampleBase64;
    const language = body?.language || "en";
    const speaker = body?.speaker || "p225";

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing required field: text" }, { status: 400 });
    }

    console.log('🔵 TTS Request:', {
      server: LOCAL_TTS_SERVER,
      textLength: text.length,
      language,
      hasVoiceSample: !!voiceSampleBase64,
    });

    // Prepare payload for local TTS server
    const payload: Record<string, unknown> = {
      text,
      language,
      speaker,
    };

    if (voiceSampleBase64 && typeof voiceSampleBase64 === "string") {
      payload.voiceSampleBase64 = voiceSampleBase64;
    }

    // Call local TTS server with a generous timeout for long texts
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes

    let response: Response;
    try {
      response = await fetch(`${LOCAL_TTS_SERVER}/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = response.headers.get("content-length");

    console.log('🟢 TTS Response:', {
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength: contentLength ? `${contentLength} bytes` : '(unknown)',
    });

    // Handle errors
    if (!response.ok) {
      if (contentType.includes("application/json")) {
        const json = await response.json().catch(() => null);
        const errorMessage = json?.error ?? "TTS server error";
        
        console.error('❌ TTS Error:', errorMessage);
        
        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        );
      }
      
      console.error('❌ TTS Error: Non-JSON error response');
      return NextResponse.json(
        { error: `TTS server error: ${response.statusText}` },
        { status: response.status }
      );
    }

    // If response is JSON (error), return it
    if (contentType.includes("application/json")) {
      const json = await response.json().catch(() => null);
      const errorMessage = json?.error ?? json ?? "TTS server error";
      
      console.error('❌ TTS Error (JSON response):', errorMessage);
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Stream the audio bytes back to the client
    const stream = response.body;
    if (!stream) {
      console.error('❌ No stream in response body');
      return NextResponse.json({ error: "No audio stream returned from TTS server." }, { status: 500 });
    }

    // Validate content length
    if (contentLength && parseInt(contentLength) < 100) {
      console.warn('⚠️ Content-Length is suspiciously small:', contentLength, 'bytes');
    }

    console.log('✅ Streaming audio response to client');

    const modelUsed = response.headers.get("x-tts-model") ?? "";
    return new NextResponse(stream, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        ...(modelUsed && { "X-TTS-Model": modelUsed }),
      },
    });
  } catch (error) {
    console.error('❌ TTS Request failed:', error);
    
    const errMsg = error instanceof Error ? error.message : String(error);
    const isConnectionError =
      errMsg.includes("fetch") ||
      errMsg.includes("ECONNREFUSED") ||
      errMsg.includes("ECONNRESET") ||
      errMsg.includes("abort");

    if (isConnectionError) {
      return NextResponse.json(
        {
          error: "Cannot connect to local TTS server",
          details: `Make sure the TTS server is running at ${LOCAL_TTS_SERVER}`,
          instructions: "Run 'cd tts-server && ./start.sh' (macOS/Linux) or 'cd tts-server && start.bat' (Windows)"
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
