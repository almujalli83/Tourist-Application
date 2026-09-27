/**
 * Nusuk (Ministry of Hajj and Umrah): Umrah and Rawdah permits are issued in the Nusuk app. There
 * is no public API, so travellers are sent to Nusuk to book. When an agreement provides one, set
 * NUSUK_API_URL (+ NUSUK_API_TOKEN): the traveller's permits are then shown here. Expected: GET
 * {url}/permits?passportNo=…&nationality=… → [{ type: "umrah"|"rawdah", date, time, status }].
 */

export const nusukLinks = () => ({
  web: process.env.NUSUK_URL?.trim() || "https://www.nusuk.sa",
  ios: process.env.NUSUK_IOS_URL?.trim() || "https://apps.apple.com/app/nusuk/id6469515422",
  android: process.env.NUSUK_ANDROID_URL?.trim() || "https://play.google.com/store/apps/details?id=com.moh.nusukapp",
});

export interface NusukPermit {
  type: "umrah" | "rawdah";
  date: string;
  time: string | null;
  status: "confirmed" | "pending" | "cancelled";
}

export const nusukLinked = () => !!process.env.NUSUK_API_URL?.trim();

/** The traveller's permits from Nusuk (null when not linked or unreachable). */
export async function nusukPermits(passportNo: string, nationality: string): Promise<NusukPermit[] | null> {
  const url = process.env.NUSUK_API_URL?.trim();
  if (!url) return null;
  try {
    const q = new URLSearchParams({ passportNo, nationality });
    const res = await fetch(`${url.replace(/\/$/, "")}/permits?${q}`, {
      headers: { accept: "application/json", ...(process.env.NUSUK_API_TOKEN ? { authorization: `Bearer ${process.env.NUSUK_API_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const rows = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Record<string, unknown>[];
    return rows
      .map((r) => ({
        type: r.type === "rawdah" ? "rawdah" : "umrah",
        date: String(r.date ?? "").slice(0, 10),
        time: typeof r.time === "string" ? r.time.slice(0, 5) : null,
        status: r.status === "cancelled" ? "cancelled" : r.status === "pending" ? "pending" : "confirmed",
      }) as NusukPermit)
      .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  } catch {
    return null;
  }
}
