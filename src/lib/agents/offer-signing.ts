/**
 * Offers are signed by the server (HMAC) when returned from a search and verified when
 * booked. This keeps prices tamper-proof without shared server memory, so it works on
 * serverless platforms with many instances (e.g. Vercel).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { secretFor } from "../secrets";

export const OFFER_TTL_MS = 45 * 60 * 1000;

export interface Signed {
  expiresAt?: string;
  sig?: string;
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
  return createHmac("sha256", secretFor("offers")).update(canonical(rest)).digest("base64url");
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
