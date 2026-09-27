/**
 * Signed-in devices. Each sign-in creates a session record; the cookie carries its id, so a
 * session can be signed out from another device, and all sessions end when the password changes.
 */
import { createHash, randomBytes } from "node:crypto";
import { store } from "../store";

export type LoginMethod = "password" | "register" | "reset" | "otp" | "google" | "apple" | "nafath";

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** Browser and system, from the user agent (for "your devices"). */
  device: string;
  /** Hash of the user agent, to recognise a new device. */
  deviceKey: string;
  method: LoginMethod;
  revokedAt?: string;
}

const TOUCH_MS = 10 * 60_000;

/** A short, readable description of a user agent ("Chrome on Android"). */
export function describeDevice(ua: string): string {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export const deviceKeyOf = (ua: string) => createHash("sha256").update(describeDevice(ua)).digest("hex").slice(0, 16);

export async function createSession(userId: string, opts: { ua: string; method: LoginMethod; ttlMs: number }, now = new Date()): Promise<SessionRecord> {
  const s: SessionRecord = {
    id: randomBytes(18).toString("base64url"),
    userId,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + opts.ttlMs).toISOString(),
    device: describeDevice(opts.ua),
    deviceKey: deviceKeyOf(opts.ua),
    method: opts.method,
  };
  await store().put("sessions", s.id, s);
  return s;
}

/** The active session with this id, refreshed now and then; null when signed out or expired. */
export async function activeSession(id: string, userId: string, now = new Date()): Promise<SessionRecord | null> {
  const s = await store().get<SessionRecord>("sessions", id);
  if (!s || s.userId !== userId || s.revokedAt || Date.parse(s.expiresAt) <= now.getTime()) return null;
  if (now.getTime() - Date.parse(s.lastSeenAt) > TOUCH_MS) {
    await store().update<SessionRecord>("sessions", id, (x) => ({ ...x, lastSeenAt: now.toISOString() }));
  }
  return s;
}

export async function listSessions(userId: string, now = new Date()): Promise<SessionRecord[]> {
  return (await store().findBy<SessionRecord>("sessions", "userId", userId))
    .filter((s) => !s.revokedAt && Date.parse(s.expiresAt) > now.getTime())
    .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** Has this user signed in from this kind of device before? */
export async function knownDevice(userId: string, deviceKey: string): Promise<boolean> {
  return (await store().findBy<SessionRecord>("sessions", "userId", userId)).some((s) => s.deviceKey === deviceKey);
}

export async function revokeSession(userId: string, id: string): Promise<boolean> {
  const s = await store().get<SessionRecord>("sessions", id);
  if (!s || s.userId !== userId || s.revokedAt) return false;
  await store().update<SessionRecord>("sessions", id, (x) => ({ ...x, revokedAt: new Date().toISOString() }));
  return true;
}

/** Signs out every device (except `keep`); returns how many. */
export async function revokeAllSessions(userId: string, keep?: string): Promise<number> {
  let n = 0;
  for (const s of await listSessions(userId)) {
    if (s.id === keep) continue;
    await store().update<SessionRecord>("sessions", s.id, (x) => ({ ...x, revokedAt: new Date().toISOString() }));
    n++;
  }
  return n;
}
