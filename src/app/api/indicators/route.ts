import { timingSafeEqual } from "node:crypto";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { indicators, isMonth, toCsv } from "@/lib/indicators/indicators";

/** The Ministry's data platform: Authorization: Bearer {INDICATORS_TOKEN}. */
function bearerOk(req: Request): boolean {
  const want = process.env.INDICATORS_TOKEN?.trim();
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!want || !got || want.length < 16) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Aggregated, anonymous tourism indicators: ?from=YYYY-MM&to=YYYY-MM&city=RUH&format=json|csv
 * (default: the last 12 months). For the back office, Ministry viewers (MINISTRY_EMAILS) and the
 * Ministry's platform (bearer token).
 */
export const GET = handle(async (req: Request) => {
  if (!bearerOk(req)) {
    const u = await currentUser();
    if (!u) return error("unauthorized", 401);
    if (!u.isAdmin && !u.isMinistry) return error("forbidden", 403);
  }
  const q = new URL(req.url).searchParams;
  const now = new Date();
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const from = q.get("from") ?? month(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)));
  const to = q.get("to") ?? month(now);
  const city = q.get("city") || undefined;
  if (!isMonth(from) || !isMonth(to) || from > to) return error("invalidPeriod", 400);
  if (city && !/^[A-Z]{3}$/.test(city)) return error("invalidCity", 400);
  const data = await indicators({ from, to, city });
  if (q.get("format") === "csv") {
    return new Response(toCsv(data), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tourism-indicators-${from}-${to}${city ? `-${city}` : ""}.csv"`, "cache-control": "no-store" },
    });
  }
  return json(data);
});
