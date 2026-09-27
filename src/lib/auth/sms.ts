/**
 * Verification codes by text message through an SMS provider (technical integration).
 *
 * SMS_PROVIDER = {"url": "https://…/messages", "token": "…", "sender": "SaudiTrip"}
 * POST {url} with JSON { to, sender, text } and a bearer token (the contract is confirmed with
 * the chosen provider, e.g. Unifonic or Taqnyat). Without it, the sandbox accepts the code 123456
 * and nothing is sent.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { secretFor } from "../secrets";
import { store } from "../store";

export const SANDBOX_CODE = "123456";
const TTL_MS = 10 * 60_000;
const RESEND_MS = 60_000;
const MAX_TRIES = 5;

interface SmsConfig {
  url: string;
  token?: string;
  sender?: string;
}

export function smsConfig(): SmsConfig | null {
  try {
    const c = JSON.parse(process.env.SMS_PROVIDER?.trim() || "null") as SmsConfig | null;
    return c && /^https?:\/\//.test(c.url) ? c : null;
  } catch {
    return null;
  }
}
export const smsSandbox = () => !smsConfig();

export class SmsError extends Error {}

interface CodeDoc {
  id: string;
  purpose: string;
  phone: string;
  hash: string;
  sentAt: string;
  expiresAt: string;
  tries: number;
}

const idOf = (purpose: string, phone: string) => `sms:${createHash("sha256").update(`${purpose}|${phone}`).digest("hex").slice(0, 32)}`;
const hashCode = (code: string, phone: string) => createHash("sha256").update(`${secretFor("data")}|${phone}|${code}`).digest("hex");

/** Sends a 6-digit code to a phone for a purpose (e.g. "verify:{userId}", "login"). */
export async function sendCode(purpose: string, phone: string, text: (code: string) => string, fetchImpl: typeof fetch = fetch, now = new Date()): Promise<{ sandbox: boolean }> {
  const id = idOf(purpose, phone);
  const prev = await store().get<CodeDoc>("authTokens", id);
  if (prev && now.getTime() - Date.parse(prev.sentAt) < RESEND_MS) throw new SmsError("tooSoon");
  const cfg = smsConfig();
  const code = cfg ? String(randomInt(0, 1_000_000)).padStart(6, "0") : SANDBOX_CODE;
  if (cfg) {
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify({ to: phone, sender: cfg.sender ?? "SaudiTrip", text: text(code) }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) throw new SmsError("sendFailed");
  }
  await store().put<CodeDoc>("authTokens", id, { id, purpose, phone, hash: hashCode(code, phone), sentAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL_MS).toISOString(), tries: 0 });
  return { sandbox: !cfg };
}

/** Checks a code (single use; at most 5 tries). */
export async function checkCode(purpose: string, phone: string, code: string, now = new Date()): Promise<"ok" | "wrong" | "expired"> {
  const id = idOf(purpose, phone);
  const doc = await store().get<CodeDoc>("authTokens", id);
  if (!doc || Date.parse(doc.expiresAt) <= now.getTime() || doc.tries >= MAX_TRIES) return "expired";
  const given = Buffer.from(hashCode(String(code).trim(), phone));
  if (!timingSafeEqual(given, Buffer.from(doc.hash))) {
    await store().update<CodeDoc>("authTokens", id, (d) => ({ ...d, tries: d.tries + 1 }));
    return "wrong";
  }
  await store().delete("authTokens", id);
  return "ok";
}
