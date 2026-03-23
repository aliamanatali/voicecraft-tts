import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 1800; // 30 minutes for large texts (30-40k+ chars)

const LOCAL_TTS_SERVER = process.env.LOCAL_TTS_SERVER_URL || "http://localhost:5001";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const text = body?.text;
    const voiceSampleBase64 = body?.voiceSampleBase64;
    const language = body?.language || "en";

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing required field: text" }, { status: 400 });
    }

    console.log("🔵 TTS Stream Request:", {
      server: LOCAL_TTS_SERVER,
      textLength: text.length,
      language,
      hasVoiceSample: !!voiceSampleBase64,
    });

    const speaker = body?.speaker || "p225";
    const payload: Record<string, unknown> = { text, language, speaker };
    if (voiceSampleBase64 && typeof voiceSampleBase64 === "string") {
      payload.voiceSampleBase64 = voiceSampleBase64;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 minutes

    let response: Response;
    try {
      response = await fetch(`${LOCAL_TTS_SERVER}/tts/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }

    if (!response.ok) {
      clearTimeout(timeout);
      const errorBody = await response.json().catch(() => null);
      return NextResponse.json(
        { error: errorBody?.error ?? `TTS server error: ${response.statusText}` },
        { status: response.status }
      );
    }

    const stream = response.body;
    if (!stream) {
      clearTimeout(timeout);
      return NextResponse.json({ error: "No stream returned from TTS server." }, { status: 500 });
    }

    // Proxy the SSE stream, clear timeout when done
    const passthrough = new TransformStream({
      flush() {
        clearTimeout(timeout);
      },
    });
    stream.pipeTo(passthrough.writable);

    return new NextResponse(passthrough.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("❌ TTS Stream request failed:", error);
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
