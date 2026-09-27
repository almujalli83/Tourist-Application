/**
 * Single-use links (password reset, email verification, email change). Only a hash of the token is
 * stored, so the database never holds a usable link.
 */
import { createHash, randomBytes } from "node:crypto";
import { store } from "../store";

export type TokenKind = "reset" | "verifyEmail" | "changeEmail" | "mfaLogin" | "signup" | "nafath";

interface TokenDoc {
  id: string;
  kind: TokenKind;
  userId: string;
  expiresAt: string;
  usedAt?: string;
  data?: Record<string, string | boolean>;
}

const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function issueToken(kind: TokenKind, userId: string, ttlMs: number, data?: TokenDoc["data"], now = new Date()): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await store().put<TokenDoc>("authTokens", hashOf(raw), { id: hashOf(raw), kind, userId, expiresAt: new Date(now.getTime() + ttlMs).toISOString(), ...(data ? { data } : {}) });
  return raw;
}

/** Checks a token without using it. */
export async function peekToken(kind: TokenKind, raw: string, now = new Date()): Promise<TokenDoc | null> {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 100) return null;
  const t = await store().get<TokenDoc>("authTokens", hashOf(raw));
  return t && t.kind === kind && !t.usedAt && Date.parse(t.expiresAt) > now.getTime() ? t : null;
}

/** Uses a token once; null when unknown, expired, already used or of another kind. */
export async function consumeToken(kind: TokenKind, raw: string, now = new Date()): Promise<TokenDoc | null> {
  const t = await peekToken(kind, raw, now);
  if (!t) return null;
  let first = false;
  await store().update<TokenDoc>("authTokens", t.id, (x) => {
    if (x.usedAt) return x;
    first = true;
    return { ...x, usedAt: now.toISOString() };
  });
  return first ? t : null;
}

/** Ends the user's open links of a kind (e.g. older reset links once the password changed). */
export async function voidTokens(userId: string, kind: TokenKind): Promise<void> {
  for (const t of await store().findBy<TokenDoc>("authTokens", "userId", userId)) {
    if (t.kind === kind && !t.usedAt) await store().update<TokenDoc>("authTokens", t.id, (x) => ({ ...x, usedAt: new Date().toISOString() }));
  }
}
