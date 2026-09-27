/**
 * Limits on repeated attempts (wrong passwords, codes, reset requests), per account and per
 * network address. After the limit the key is locked until its window ends.
 */
import { createHash } from "node:crypto";
import { secretFor } from "../secrets";
import { store } from "../store";

interface Bucket {
  id: string;
  count: number;
  windowStart: string;
}

export interface Rule {
  limit: number;
  windowMs: number;
}

export const RULES = {
  login: { limit: 5, windowMs: 15 * 60_000 },
  loginIp: { limit: 30, windowMs: 15 * 60_000 },
  code: { limit: 5, windowMs: 15 * 60_000 },
  send: { limit: 5, windowMs: 60 * 60_000 },
} satisfies Record<string, Rule>;

const idOf = (key: string) => createHash("sha256").update(`${secretFor("data")}|${key}`).digest("hex").slice(0, 40);

/** Minutes until the key is free again; 0 when not locked. */
export async function lockedFor(key: string, rule: Rule, now = new Date()): Promise<number> {
  const b = await store().get<Bucket>("authThrottle", idOf(key));
  if (!b) return 0;
  const left = Date.parse(b.windowStart) + rule.windowMs - now.getTime();
  return left > 0 && b.count >= rule.limit ? Math.ceil(left / 60_000) : 0;
}

/** Counts an attempt. */
export async function hit(key: string, rule: Rule, now = new Date()): Promise<void> {
  const id = idOf(key);
  const s = store();
  const fresh = { id, count: 1, windowStart: now.toISOString() };
  const cur = await s.get<Bucket>("authThrottle", id);
  if (!cur || Date.parse(cur.windowStart) + rule.windowMs <= now.getTime()) await s.put("authThrottle", id, fresh);
  else await s.update<Bucket>("authThrottle", id, (b) => ({ ...b, count: b.count + 1 }));
}

export async function clearHits(key: string): Promise<void> {
  await store().delete("authThrottle", idOf(key));
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}
