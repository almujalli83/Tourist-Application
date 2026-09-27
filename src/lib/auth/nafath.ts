/**
 * Sign in with Nafath (the national single sign-on) for citizens and residents; technical integration.
 *
 * NAFATH = {"url": "https://…", "appId": "…", "appKey": "…", "service": "Login"}
 * 1. POST {url}/api/v1/mfa/request?local={ar|en}&requestId={uuid} { nationalId, service }
 *    → { transId, random }: the person approves the request in the Nafath app by choosing `random`.
 * 2. POST {url}/api/v1/mfa/request/status { nationalId, transId, random }
 *    → { status: "WAITING" | "COMPLETED" | "REJECTED" | "EXPIRED", person?: { fullNameAr, fullNameEn, nationality } }
 * (headers APP-ID and APP-KEY; the contract is confirmed when the platform is onboarded).
 * Without settings, a sandbox approves the request after a few seconds (outside production, or
 * with DEMO_SOCIAL_LOGIN=on).
 */
import { randomInt, randomUUID } from "node:crypto";
import { sandboxLoginAllowed } from "./social";

interface NafathConfig {
  url: string;
  appId: string;
  appKey: string;
  service?: string;
}

export function nafathConfig(): NafathConfig | null {
  try {
    const c = JSON.parse(process.env.NAFATH?.trim() || "null") as NafathConfig | null;
    return c && /^https:\/\//.test(c.url) && c.appId && c.appKey ? c : null;
  } catch {
    return null;
  }
}

export const nafathMode = (): "live" | "sandbox" | null => (nafathConfig() ? "live" : sandboxLoginAllowed() ? "sandbox" : null);

/** Saudi national ID (starts with 1) or residence (iqama, starts with 2): 10 digits with a check digit. */
export function validNationalId(id: string): boolean {
  if (!/^[12]\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(id[i]);
    if (i % 2 === 0) {
      const x = d * 2;
      sum += Math.floor(x / 10) + (x % 10);
    } else sum += d;
  }
  return sum % 10 === 0;
}

export class NafathError extends Error {}

export interface NafathPerson {
  fullNameAr: string | null;
  fullNameEn: string | null;
  nationality: string | null;
}

export const SANDBOX_APPROVE_MS = 4000;

export async function nafathRequest(nationalId: string, locale: "ar" | "en", fetchImpl: typeof fetch = fetch): Promise<{ transId: string; random: string; sandbox: boolean }> {
  const c = nafathConfig();
  if (!c) {
    if (!sandboxLoginAllowed()) throw new NafathError("unavailable");
    return { transId: `sbx-${randomUUID()}`, random: String(randomInt(10, 100)), sandbox: true };
  }
  const res = await fetchImpl(`${c.url.replace(/\/$/, "")}/api/v1/mfa/request?local=${locale}&requestId=${randomUUID()}`, {
    method: "POST",
    headers: { "content-type": "application/json", "APP-ID": c.appId, "APP-KEY": c.appKey },
    body: JSON.stringify({ nationalId, service: c.service ?? "Login" }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) throw new NafathError(res?.status === 400 ? "invalidId" : "unavailable");
  const d = (await res.json()) as { transId?: string; random?: string | number };
  if (!d.transId || d.random === undefined) throw new NafathError("unavailable");
  return { transId: d.transId, random: String(d.random), sandbox: false };
}

export async function nafathStatus(nationalId: string, transId: string, random: string, startedAt: number, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<{ status: "WAITING" | "COMPLETED" | "REJECTED" | "EXPIRED"; person?: NafathPerson }> {
  const c = nafathConfig();
  if (!c) {
    if (now - startedAt < SANDBOX_APPROVE_MS) return { status: "WAITING" };
    return { status: "COMPLETED", person: { fullNameAr: "مستخدم تجريبي", fullNameEn: "Sandbox User", nationality: nationalId.startsWith("1") ? "SA" : null } };
  }
  const res = await fetchImpl(`${c.url.replace(/\/$/, "")}/api/v1/mfa/request/status`, {
    method: "POST",
    headers: { "content-type": "application/json", "APP-ID": c.appId, "APP-KEY": c.appKey },
    body: JSON.stringify({ nationalId, transId, random }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!res?.ok) return { status: "WAITING" };
  const d = (await res.json()) as { status?: string; person?: Partial<NafathPerson> };
  const status = (["WAITING", "COMPLETED", "REJECTED", "EXPIRED"].includes(String(d.status)) ? d.status : "WAITING") as "WAITING";
  return {
    status,
    ...(status === ("COMPLETED" as string) ? { person: { fullNameAr: d.person?.fullNameAr ?? null, fullNameEn: d.person?.fullNameEn ?? null, nationality: d.person?.nationality ?? null } } : {}),
  };
}
