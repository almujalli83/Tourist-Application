/**
 * Synthetic narration through a text-to-speech provider (technical integration).
 *
 * TTS_PROVIDER = {"url": "https://…/synthesize", "token": "…", "voices": {"ar": "…", "en": "…"}}
 * POST {url} with JSON { text, lang, voice?, format: "mp3" } and a bearer token; the response body
 * is the audio (audio/mpeg, audio/ogg, …). Generated audio is stored and reused until the text
 * changes. Without the setting, visitors hear the narration in their device's own voice (free,
 * works offline where the device has the voice installed).
 */
import type { AudioLang } from "./types";

interface TtsConfig {
  url: string;
  token?: string;
  voices?: Partial<Record<AudioLang, string>>;
}

export function ttsConfig(): TtsConfig | null {
  const raw = process.env.TTS_PROVIDER?.trim();
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as TtsConfig;
    return typeof c.url === "string" && /^https?:\/\//.test(c.url) ? c : null;
  } catch {
    return null;
  }
}

export const ttsConfigured = () => !!ttsConfig();

export class TtsError extends Error {}

/** Audio file types accepted for recordings and from the provider (by content, not by name). */
export function sniffAudio(b: Buffer): "audio/mpeg" | "audio/ogg" | "audio/wav" | "audio/mp4" | "audio/webm" | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (b.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE") return "audio/wav";
  if (b.subarray(4, 8).toString("latin1") === "ftyp") return "audio/mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  return null;
}

export async function synthesize(text: string, lang: AudioLang, fetchImpl: typeof fetch = fetch): Promise<{ data: Buffer; contentType: string }> {
  const c = ttsConfig();
  if (!c) throw new TtsError("notConfigured");
  const res = await fetchImpl(c.url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/*", ...(c.token ? { authorization: `Bearer ${c.token}` } : {}) },
    body: JSON.stringify({ text, lang, format: "mp3", ...(c.voices?.[lang] ? { voice: c.voices[lang] } : {}) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new TtsError(`upstream ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const contentType = sniffAudio(data);
  if (!contentType) throw new TtsError("notAudio");
  return { data, contentType };
}
