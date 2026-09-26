/**
 * Daily limits for the AI features (cost control). Signed-in accounts are counted per account,
 * visitors per hashed IP address. Assistant and translation: ASSISTANT_DAILY_LIMIT_USER (default
 * 100) and ASSISTANT_DAILY_LIMIT_GUEST (default 25). Trip planner (plans and regenerated days):
 * PLANNER_DAILY_LIMIT_USER (default 20) and PLANNER_DAILY_LIMIT_GUEST (default 5).
 */
import { createHash } from "node:crypto";
import { todayISO } from "../dates";
import { secretFor } from "../secrets";
import { store } from "../store";

interface UsageDoc { id: string; count: number }

export type QuotaKind = "assistant" | "planner";
const DEFAULTS: Record<QuotaKind, [number, number]> = { assistant: [100, 25], planner: [20, 5] };

const limitFor = (signedIn: boolean, kind: QuotaKind = "assistant") => {
  const prefix = kind === "planner" ? "PLANNER" : "ASSISTANT";
  const v = Number(process.env[`${prefix}_DAILY_LIMIT_${signedIn ? "USER" : "GUEST"}`]);
  return Number.isFinite(v) && v > 0 ? v : DEFAULTS[kind][signedIn ? 0 : 1];
};
const docId = (key: string, kind: QuotaKind) => (kind === "assistant" ? `${todayISO()}|${key}` : `${todayISO()}|${kind}|${key}`);

/** Stable, non-reversible key for a visitor's IP address. */
export function visitorKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${createHash("sha256").update(`${secretFor("data")}|${ip}`).digest("hex").slice(0, 32)}`;
}

/** Counts one message; returns false (without counting) when the day's limit is reached. */
export async function takeQuota(key: string, signedIn: boolean, kind: QuotaKind = "assistant"): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit = limitFor(signedIn, kind);
  const id = docId(key, kind);
  const s = store();
  await s.insert<UsageDoc>("aiUsage", id, { id, count: 0 });
  let ok = false;
  const doc = await s.update<UsageDoc>("aiUsage", id, (d) => {
    if (d.count >= limit) return d;
    ok = true;
    return { ...d, count: d.count + 1 };
  });
  return { ok, remaining: Math.max(0, limit - (doc?.count ?? limit)), limit };
}

export async function quotaLeft(key: string, signedIn: boolean, kind: QuotaKind = "assistant"): Promise<number> {
  const limit = limitFor(signedIn, kind);
  const doc = await store().get<UsageDoc>("aiUsage", docId(key, kind));
  return Math.max(0, limit - (doc?.count ?? 0));
}
