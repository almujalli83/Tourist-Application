/**
 * Sign in with Google and Apple (OpenID Connect, authorization code flow; technical integration).
 *
 * Google: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (PKCE).
 * Apple: APPLE_CLIENT_ID (Services ID), APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8
 * key; the client secret is a short-lived ES256 token signed with it). Apple returns to the
 * callback with a form POST.
 * Redirect URIs to register: {site}/api/auth/oauth/{google|apple}/callback.
 *
 * Without settings, a sandbox sign-in page is used outside production (or with
 * DEMO_SOCIAL_LOGIN=on); sandbox identities are separate and never join an existing account by email.
 */
import { createHash, createHmac, createPrivateKey, randomBytes, sign as signData, timingSafeEqual } from "node:crypto";
import { secretFor } from "../secrets";

export type SocialProvider = "google" | "apple";

export interface SocialProfile {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  sandbox: boolean;
}

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
export const appleConfigured = () => !!(process.env.APPLE_CLIENT_ID?.trim() && process.env.APPLE_TEAM_ID?.trim() && process.env.APPLE_KEY_ID?.trim() && process.env.APPLE_PRIVATE_KEY?.trim());
export const sandboxLoginAllowed = () => process.env.NODE_ENV !== "production" || process.env.DEMO_SOCIAL_LOGIN === "on";

/** "live", "sandbox" or null (not offered). */
export function providerMode(p: SocialProvider): "live" | "sandbox" | null {
  if (p === "google" ? googleConfigured() : appleConfigured()) return "live";
  return sandboxLoginAllowed() ? "sandbox" : null;
}

/* ---------------------------------------------------------------- signed state cookie */

export const STATE_COOKIE = "ta_oauth";

export interface OAuthState {
  provider: SocialProvider;
  state: string;
  verifier: string;
  nonce: string;
  locale: "ar" | "en";
  next: string;
  /** "link": add the provider to the signed-in account. */
  mode: "login" | "link";
  exp: number;
}

const mac = (payload: string) => createHmac("sha256", secretFor("session")).update(`oauth|${payload}`).digest("base64url");

export function sealState(s: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function openState(raw: string | undefined, now = Date.now()): OAuthState | null {
  const [payload, sig] = (raw ?? "").split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(mac(payload));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
    return s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function newState(provider: SocialProvider, opts: { locale: "ar" | "en"; next: string; mode: "login" | "link" }): OAuthState {
  return {
    provider, ...opts,
    state: randomBytes(16).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + 10 * 60_000,
  };
}

/* ---------------------------------------------------------------- authorization URLs */

export const callbackUrl = (site: string, p: SocialProvider) => `${site}/api/auth/oauth/${p}/callback`;

export function authorizeUrl(s: OAuthState, site: string): string {
  const mode = providerMode(s.provider);
  if (mode === "sandbox") return `${site}/${s.locale}/auth/sandbox?provider=${s.provider}&state=${encodeURIComponent(s.state)}`;
  if (s.provider === "google") {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(), redirect_uri: callbackUrl(site, "google"), response_type: "code",
      scope: "openid email profile", state: s.state, nonce: s.nonce, prompt: "select_account",
      code_challenge: createHash("sha256").update(s.verifier).digest("base64url"), code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID!.trim(), redirect_uri: callbackUrl(site, "apple"), response_type: "code",
    scope: "name email", response_mode: "form_post", state: s.state, nonce: s.nonce,
  });
  return `https://appleid.apple.com/auth/authorize?${q}`;
}

/* ---------------------------------------------------------------- code exchange */

export class SocialError extends Error {}

function claimsOf(idToken: string): Record<string, unknown> {
  const part = idToken.split(".")[1];
  if (!part) throw new SocialError("badToken");
  return JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
}

/** Apple's client secret: an ES256 token signed with the team's key (valid 5 minutes). */
export function appleClientSecret(now = Date.now()): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APPLE_KEY_ID!.trim() })).toString("base64url");
  const iat = Math.floor(now / 1000);
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APPLE_TEAM_ID!.trim(), iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: process.env.APPLE_CLIENT_ID!.trim() })).toString("base64url");
  const key = createPrivateKey(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const sig = signData("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${header}.${claims}.${sig}`;
}

/**
 * Exchanges the authorization code with the provider (server to server over TLS, so the returned
 * ID token's claims are taken as issued) and checks audience, issuer, expiry and nonce.
 */
export async function exchangeCode(s: OAuthState, code: string, site: string, fetchImpl: typeof fetch = fetch): Promise<SocialProfile> {
  if (providerMode(s.provider) === "sandbox") {
    // Sandbox code: base64url JSON { email, name } from the sandbox page.
    try {
      const d = JSON.parse(Buffer.from(code.replace(/^sandbox:/, ""), "base64url").toString()) as { email?: string; name?: string };
      const email = (d.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error();
      return { subject: email, email, emailVerified: false, name: d.name?.trim().slice(0, 80) || null, sandbox: true };
    } catch {
      throw new SocialError("badCode");
    }
  }
  const google = s.provider === "google";
  const body = new URLSearchParams(google
    ? { code, client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), redirect_uri: callbackUrl(site, "google"), grant_type: "authorization_code", code_verifier: s.verifier }
    : { code, client_id: process.env.APPLE_CLIENT_ID!.trim(), client_secret: appleClientSecret(), redirect_uri: callbackUrl(site, "apple"), grant_type: "authorization_code" });
  const res = await fetchImpl(google ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) throw new SocialError("exchangeFailed");
  const tok = (await res.json()) as { id_token?: string };
  if (!tok.id_token) throw new SocialError("badToken");
  const c = claimsOf(tok.id_token);
  const aud = google ? process.env.GOOGLE_CLIENT_ID!.trim() : process.env.APPLE_CLIENT_ID!.trim();
  const issOk = google ? ["https://accounts.google.com", "accounts.google.com"].includes(String(c.iss)) : c.iss === "https://appleid.apple.com";
  const audOk = Array.isArray(c.aud) ? c.aud.includes(aud) : c.aud === aud;
  if (!issOk || !audOk || typeof c.exp !== "number" || c.exp * 1000 < Date.now() || (c.nonce !== undefined && c.nonce !== s.nonce) || typeof c.sub !== "string") throw new SocialError("badToken");
  const email = typeof c.email === "string" ? c.email.toLowerCase() : null;
  return {
    subject: c.sub,
    email,
    emailVerified: c.email_verified === true || c.email_verified === "true",
    name: typeof c.name === "string" ? c.name.slice(0, 80) : null,
    sandbox: false,
  };
}
