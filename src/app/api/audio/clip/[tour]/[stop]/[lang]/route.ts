import { currentUser } from "@/lib/auth/session";
import { stopAudio } from "@/lib/audio/tours";
import { isAudioLang } from "@/lib/audio/types";
import { handle } from "@/lib/http";

export const maxDuration = 60;

/**
 * A stop's narration audio. The URL carries a version (?v=) that changes with the recording or the
 * text, so it can be cached for good (and saved on the device for offline listening).
 * Supports byte ranges (required by Safari for media).
 */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ tour: string; stop: string; lang: string }> }) => {
  const { tour, stop, lang } = await params;
  if (!isAudioLang(lang)) return new Response("Not found", { status: 404 });
  const preview = new URL(req.url).searchParams.get("preview") === "1" && !!(await currentUser())?.isAdmin;
  const out = await stopAudio(tour, stop, lang, { drafts: preview }).catch(() => null);
  if (!out) return new Response("Not found", { status: 404 });
  const size = out.data.length;
  const headers: Record<string, string> = {
    "content-type": out.contentType,
    "accept-ranges": "bytes",
    "cache-control": preview ? "no-store" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(new Uint8Array(out.data.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(out.data), { headers: { ...headers, "content-length": String(size) } });
});
