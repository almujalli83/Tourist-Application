/**
 * Offers are signed by the server (HMAC) when returned from a search and verified when
 * booked. This keeps prices tamper-proof without shared server memory, so it works on
 * serverless platforms with many instances (e.g. Vercel).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const OFFER_TTL_MS = 45 * 60 * 1000;

export interface Signed {
  expiresAt?: string;
  sig?: string;
}

export class ServerConfigError extends Error {
  name = "ServerConfigError";
}

function secret(): string {
  const s = process.env.OFFER_SECRET || process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production")
    throw new ServerConfigError("SESSION_SECRET environment variable is not set (required in production)");
  return s || "dev-only-offer-secret";
}

/** Deterministic JSON (sorted keys) so the signature does not depend on key order. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

function digest(offer: object): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sig, ...rest } = offer as Signed & Record<string, unknown>;
  return createHmac("sha256", secret()).update(canonical(rest)).digest("base64url");
}

export function signOffer<T extends object>(offer: T, now = Date.now()): T & Signed {
  const withExpiry = { ...offer, expiresAt: new Date(now + OFFER_TTL_MS).toISOString() };
  return { ...withExpiry, sig: digest(withExpiry) };
}

export function verifyOffer<T extends object>(offer: (T & Signed) | undefined | null, now = Date.now()): boolean {
  if (!offer?.sig || !offer.expiresAt || Date.parse(offer.expiresAt) < now) return false;
  const a = Buffer.from(offer.sig);
  const b = Buffer.from(digest(offer));
  return a.length === b.length && timingSafeEqual(a, b);
}
