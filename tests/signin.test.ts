import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.cookies.has(n) ? { name: n, value: jar.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.cookies.set(n, v),
    delete: (n: string) => void jar.cookies.delete(n),
  }),
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Macintosh) Safari/605.1" }),
}));

import { createVerify, generateKeyPairSync, randomUUID } from "node:crypto";
import { AccountError, confirmPhone, sendPhoneCode } from "@/lib/auth/account";
import { hashPassword } from "@/lib/auth/password";
import { validNationalId } from "@/lib/auth/nafath";
import { completeSignup, pollNafath, resolveIdentity, sendLoginCode, signInMethods, signupPrefill, startNafath, unlinkMethod, verifyLoginCode } from "@/lib/auth/signin";
import { appleClientSecret, exchangeCode, newState, openState, sealState } from "@/lib/auth/social";
import type { StoredUser } from "@/lib/auth/types";
import { createUser, getUserById } from "@/lib/repo";

const req = () => new Request("http://localhost/api", { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Safari/605.1", "x-forwarded-for": `10.1.${Math.floor(Math.random() * 250)}.1` } });
const phoneN = () => `+9665${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

async function pwUser(): Promise<StoredUser> {
  const id = randomUUID();
  return (await createUser({
    id, email: `p${id.slice(0, 8)}@example.com`, passwordHash: await hashPassword("Secret123!"), hasPassword: true, accountType: "individual",
    individual: { fullName: "Omar", phone: phoneN(), nationality: "SA" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: new Date().toISOString(),
  }))!;
}

/** A valid national ID (Luhn-style check digit) for tests. */
function makeId(prefix: "1" | "2"): string {
  const base = prefix + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  for (let c = 0; c < 10; c++) if (validNationalId(base + c)) return base + c;
  throw new Error("no id");
}

beforeEach(() => jar.cookies.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"]) delete process.env[k];
});

describe("sign-in with a mobile number", () => {
  it("signs up a new number, then signs in with it", async () => {
    const phone = phoneN();
    expect((await sendLoginCode(phone, req())).sandbox).toBe(true);
    await expect(verifyLoginCode(phone, "111111", req(), { locale: "ar" })).rejects.toThrow("wrongCode");
    const r = await verifyLoginCode(phone, "123456", req(), { locale: "ar" });
    expect(r.status).toBe("signup");
    const ticket = (r as { ticket: string }).ticket;
    expect(await signupPrefill(ticket)).toMatchObject({ provider: "phone", phone, phoneFixed: true });
    await expect(completeSignup({ ticket, fullName: "Huda", email: "bad", nationality: "SA" }, req())).rejects.toThrow("email");
    const email = `h${randomUUID().slice(0, 6)}@example.com`;
    const done = await completeSignup({ ticket, fullName: "Huda", email, nationality: "SA", phone: "+966500000000" }, req());
    expect(done.status).toBe("ok");
    const user = (done as { user: { id: string } }).user;
    const u = (await getUserById(user.id))!;
    expect(u).toMatchObject({ hasPassword: false, verifiedPhone: phone, individual: { phone, fullName: "Huda" } });
    await expect(completeSignup({ ticket, fullName: "X", email: "x@example.com" }, req())).rejects.toThrow("expired");

    // The used code is gone: a new one signs in to the new account.
    await expect(verifyLoginCode(phone, "123456", req(), { locale: "ar" })).rejects.toThrow(AccountError);
    await sendLoginCode(phone, req());
    const again = await verifyLoginCode(phone, "123456", req(), { locale: "ar" });
    expect(again.status).toBe("ok");
    expect((again as { user: { id: string } }).user.id).toBe(user.id);
    expect((await signInMethods(user.id)).identities.map((i) => i.provider)).toEqual(["phone"]);
    await expect(unlinkMethod(user.id, (await signInMethods(user.id)).identities[0].id)).rejects.toThrow("lastMethod");
  });

  it("a verified profile number also signs in to a password account", async () => {
    const u = await pwUser();
    await sendPhoneCode(u.id);
    await confirmPhone(u.id, "123456");
    await sendLoginCode(u.individual!.phone, req());
    const r = await verifyLoginCode(u.individual!.phone, "123456", req(), { locale: "en" });
    expect(r.status).toBe("ok");
    expect((r as { user: { id: string } }).user.id).toBe(u.id);
  });
});

describe("sign-in with Google and Apple", () => {
  it("joins the account with the same verified email, creates new ones, never joins sandbox identities by email", async () => {
    const u = await pwUser();
    const r = await resolveIdentity({ provider: "google", subject: `g-${u.id}`, label: "x", sandbox: false, email: u.email, emailVerified: true, name: "Omar" }, req(), { mode: "login", locale: "ar" });
    expect(r.status).toBe("ok");
    expect((r as { user: { id: string } }).user.id).toBe(u.id);
    expect((await getUserById(u.id))!.emailVerifiedAt).toBeTruthy();

    await expect(resolveIdentity({ provider: "google", subject: u.email, label: "x", sandbox: true, email: u.email, emailVerified: false }, req(), { mode: "login", locale: "ar" })).rejects.toThrow("exists");

    const email = `a${randomUUID().slice(0, 6)}@privaterelay.appleid.com`;
    const n = await resolveIdentity({ provider: "apple", subject: `a-${email}`, label: "x", sandbox: false, email, emailVerified: true, name: "Lina" }, req(), { mode: "login", locale: "en" });
    const nu = (await getUserById((n as { user: { id: string } }).user.id))!;
    expect(nu).toMatchObject({ email, hasPassword: false, individual: { fullName: "Lina" } });

    // Linking from the account; an identity belongs to one account.
    await resolveIdentity({ provider: "apple", subject: `ap-${u.id}`, label: "x", sandbox: false }, req(), { mode: "link", userId: u.id, locale: "ar" });
    await expect(resolveIdentity({ provider: "apple", subject: `ap-${u.id}`, label: "x", sandbox: false }, req(), { mode: "link", userId: nu.id, locale: "ar" })).rejects.toThrow("identityTaken");
    expect((await signInMethods(u.id)).identities.map((i) => i.provider).sort()).toEqual(["apple", "google"]);
  });

  it("checks the ID token from Google and signs Apple's client secret", async () => {
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "sec";
    const s = newState("google", { locale: "ar", next: "/ar/account", mode: "login" });
    const token = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
    const base = { iss: "https://accounts.google.com", aud: "cid", exp: Math.floor(Date.now() / 1000) + 60, sub: "123", email: "A@Gmail.com", email_verified: true, nonce: s.nonce, name: "Ali" };
    const fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
      expect(String(init.body)).toContain(`code_verifier=${s.verifier}`);
      return new Response(JSON.stringify({ id_token: token(base) }));
    });
    const p = await exchangeCode(s, "code1", "https://x", fetchMock as unknown as typeof fetch);
    expect(p).toMatchObject({ subject: "123", email: "a@gmail.com", emailVerified: true, name: "Ali", sandbox: false });
    const bad = vi.fn(async () => new Response(JSON.stringify({ id_token: token({ ...base, aud: "other" }) })));
    await expect(exchangeCode(s, "c", "https://x", bad as unknown as typeof fetch)).rejects.toThrow("badToken");

    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    Object.assign(process.env, { APPLE_CLIENT_ID: "com.x.web", APPLE_TEAM_ID: "TEAM", APPLE_KEY_ID: "KEY", APPLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString() });
    const jwt = appleClientSecret();
    const [h, c, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toMatchObject({ iss: "TEAM", sub: "com.x.web", aud: "https://appleid.apple.com" });
    const v = createVerify("sha256").update(`${h}.${c}`);
    expect(v.verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("seals the sign-in state against tampering", () => {
    const s = newState("apple", { locale: "en", next: "/en/account", mode: "link" });
    const sealed = sealState(s);
    expect(openState(sealed)).toMatchObject({ provider: "apple", mode: "link", state: s.state });
    expect(openState(sealed.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBeNull();
    expect(openState(sealState({ ...s, exp: Date.now() - 1 }))).toBeNull();
  });
});

describe("sign-in with Nafath", () => {
  it("validates national ID numbers", () => {
    expect(validNationalId(makeId("1"))).toBe(true);
    expect(validNationalId(makeId("2"))).toBe(true);
    expect(validNationalId("3000000000")).toBe(false);
    expect(validNationalId("123")).toBe(false);
  });

  it("waits for approval, then starts sign-up (sandbox)", async () => {
    const nid = makeId("1");
    await expect(startNafath("1234567890", "ar", req(), { mode: "login" })).rejects.toThrow("nationalId");
    const s = await startNafath(nid, "ar", req(), { mode: "login" });
    expect(s.sandbox).toBe(true);
    expect(Number(s.random)).toBeGreaterThanOrEqual(10);
    expect(await pollNafath(s.ticket, req(), null)).toEqual({ status: "waiting" });
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 5000);
    const r = await pollNafath(s.ticket, req(), null);
    expect(r.status).toBe("signup");
    expect(await signupPrefill((r as { ticket: string }).ticket)).toMatchObject({ provider: "nafath", name: "مستخدم تجريبي", nationality: "SA" });
    await expect(pollNafath(s.ticket, req(), null)).rejects.toThrow("expired");
  });
});
