/**
 * Daily message limits for the assistant and translation (cost control). Signed-in accounts are
 * counted per account, visitors per hashed IP address. Limits: ASSISTANT_DAILY_LIMIT_USER (default
 * 100) and ASSISTANT_DAILY_LIMIT_GUEST (default 25).
 */
import { createHash } from "node:crypto";
import { todayISO } from "../dates";
import { secretFor } from "../secrets";
import { store } from "../store";

interface UsageDoc { id: string; count: number }

const limitFor = (signedIn: boolean) => {
  const v = Number(signedIn ? process.env.ASSISTANT_DAILY_LIMIT_USER : process.env.ASSISTANT_DAILY_LIMIT_GUEST);
  return Number.isFinite(v) && v > 0 ? v : signedIn ? 100 : 25;
};

/** Stable, non-reversible key for a visitor's IP address. */
export function visitorKey(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return `ip:${createHash("sha256").update(`${secretFor("data")}|${ip}`).digest("hex").slice(0, 32)}`;
}

/** Counts one message; returns false (without counting) when the day's limit is reached. */
export async function takeQuota(key: string, signedIn: boolean): Promise<{ ok: boolean; remaining: number; limit: number }> {
  const limit = limitFor(signedIn);
  const id = `${todayISO()}|${key}`;
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

export async function quotaLeft(key: string, signedIn: boolean): Promise<number> {
  const limit = limitFor(signedIn);
  const doc = await store().get<UsageDoc>("aiUsage", `${todayISO()}|${key}`);
  return Math.max(0, limit - (doc?.count ?? 0));
}
