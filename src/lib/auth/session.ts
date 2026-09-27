import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { getUserById } from "../repo";
import { ensureSecrets, secretFor } from "../secrets";
import { activeSession, createSession, type LoginMethod, type SessionRecord } from "./sessions";
import { toPublicUser, type PublicUser } from "./types";

export const SESSION_COOKIE = "ta_session";
/** "Keep me signed in": 30 days; otherwise until the browser closes (at most 12 hours). */
const REMEMBER_S = 60 * 60 * 24 * 30;
const SHORT_S = 60 * 60 * 12;

function sign(payload: string): string {
  return createHmac("sha256", secretFor("session")).update(payload).digest("base64url");
}

export function createSessionToken(userId: string, sessionId: string, ttlMs: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, sid: sessionId, exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): { uid: string; sid: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, sid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof uid === "string" && typeof sid === "string" && exp > Date.now() ? { uid, sid } : null;
  } catch {
    return null;
  }
}

/** Signs the user in on this device (a new session record and cookie). */
export async function setSessionCookie(userId: string, opts: { remember?: boolean; method?: LoginMethod } = {}): Promise<SessionRecord> {
  await ensureSecrets();
  const remember = opts.remember !== false;
  const ttl = (remember ? REMEMBER_S : SHORT_S) * 1000;
  const ua = (await headers()).get("user-agent") ?? "";
  const session = await createSession(userId, { ua, method: opts.method ?? "password", ttlMs: ttl });
  (await cookies()).set(SESSION_COOKIE, createSessionToken(userId, session.id, ttl), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_S } : {}),
  });
  return session;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user and the id of this device's session. */
export async function currentSession(): Promise<{ user: PublicUser; sessionId: string } | null> {
  await ensureSecrets();
  const t = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!t) return null;
  const [user, session] = await Promise.all([getUserById(t.uid), activeSession(t.sid, t.uid)]);
  if (!user || !session || user.deletedAt) return null;
  return { user: toPublicUser(user), sessionId: session.id };
}

export async function currentUser(): Promise<PublicUser | null> {
  return (await currentSession())?.user ?? null;
}
