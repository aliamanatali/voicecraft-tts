import { NextResponse } from "next/server";

const LOCAL_TTS_SERVER = process.env.LOCAL_TTS_SERVER_URL || "http://localhost:5001";

export async function GET() {
  try {
    const response = await fetch(`${LOCAL_TTS_SERVER}/voices`);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch voices" }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Cannot connect to TTS server", vits_speakers: [], xtts_languages: [] },
      { status: 503 }
    );
  }
}
