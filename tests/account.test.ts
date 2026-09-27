import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A cookie jar and request headers for the session helpers.
const jar = vi.hoisted(() => ({ cookies: new Map<string, string>(), ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1" }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.cookies.has(n) ? { name: n, value: jar.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => void jar.cookies.set(n, v),
    delete: (n: string) => void jar.cookies.delete(n),
  }),
  headers: async () => new Headers({ "user-agent": jar.ua }),
}));

import { randomUUID } from "node:crypto";
import {
  AccountError, beginMfa, changePassword, completeMfa, confirmPhone, deleteAccount, disableMfa, enableMfa, exportData, login, passwordProblem,
  requestEmailChange, requestPasswordReset, resetPassword, sendEmailVerification, sendPhoneCode, verifyEmail,
} from "@/lib/auth/account";
import { hashPassword } from "@/lib/auth/password";
import { currentSession, currentUser } from "@/lib/auth/session";
import { describeDevice, listSessions } from "@/lib/auth/sessions";
import { base32Decode, base32Encode, totpAt, verifyTotp } from "@/lib/auth/totp";
import type { StoredUser } from "@/lib/auth/types";
import { listOutbox } from "@/lib/notify";
import { createUser, getUserByEmail, getUserById } from "@/lib/repo";
import { store } from "@/lib/store";

const req = (ip = "10.0.0.1") => new Request("http://localhost/api", { headers: { "user-agent": jar.ua, "x-forwarded-for": ip } });

async function newUser(over: Partial<StoredUser> = {}): Promise<StoredUser> {
  const id = randomUUID();
  const u: StoredUser = {
    id, email: `u${id.slice(0, 8)}@example.com`, passwordHash: await hashPassword("Secret123!"), hasPassword: true, accountType: "individual",
    individual: { fullName: "Sara Ali", phone: "+966501234567", nationality: "SA" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: new Date().toISOString(), ...over,
  };
  return (await createUser(u))!;
}

/** The link sent in the latest email to this address (from the delivered text, before redaction). */
const sent: { to: string; text: string }[] = [];
beforeEach(() => {
  jar.cookies.clear();
  sent.length = 0;
  process.env.RESEND_API_KEY = "test";
  process.env.EMAIL_FROM = "noreply@example.com";
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    sent.push({ to: b.to[0], text: b.text });
    return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});
const lastToken = (to: string) => {
  const m = [...sent].reverse().find((x) => x.to === to)?.text.match(/token=([\w-]+)/);
  return m?.[1] ?? "";
};

describe("account: sign-in", () => {
  it("signs in, records the device, and signs out from another device", async () => {
    const u = await newUser();
    const r = await login({ email: u.email.toUpperCase(), password: "Secret123!" }, req());
    expect(r.status).toBe("ok");
    const s = await currentSession();
    expect(s?.user.id).toBe(u.id);
    const devices = await listSessions(u.id);
    expect(devices).toHaveLength(1);
    expect(devices[0].device).toBe("Safari · iOS");
    // First sign-in from this device: an alert email.
    expect(sent.some((m) => m.to === u.email && /new device/.test(m.text))).toBe(true);
    sent.length = 0;
    await login({ email: u.email, password: "Secret123!" }, req());
    expect(sent.some((m) => /new device/.test(m.text))).toBe(false);
    // Revoking the session signs this browser out.
    await store().update("sessions", s!.sessionId, (x: object) => ({ ...x, revokedAt: new Date().toISOString() }));
    jar.cookies.clear();
    expect(await currentUser()).toBeNull();
  });

  it("locks an account after 5 wrong passwords", async () => {
    const u = await newUser();
    for (let i = 0; i < 5; i++) await expect(login({ email: u.email, password: "wrong-pass" }, req("10.0.0.2"))).rejects.toThrow("invalid");
    const e = await login({ email: u.email, password: "Secret123!" }, req("10.0.0.2")).catch((x) => x);
    expect(e).toBeInstanceOf(AccountError);
    expect(e.message).toBe("tooManyAttempts");
    expect(e.minutes).toBeGreaterThan(0);
  });

  it("checks passwords", () => {
    expect(passwordProblem("short")).toBe("weakPassword");
    expect(passwordProblem("aaaaaaaaaa")).toBe("weakPassword");
    expect(passwordProblem("12345678")).toBe("weakPassword");
    expect(passwordProblem("me@x.com1", "ME@X.COM1")).toBe("weakPassword");
    expect(passwordProblem("Tamr-2026!")).toBeNull();
  });
});

describe("account: password reset", () => {
  it("resets with a single-use link, signs out every device and never stores the link", async () => {
    const u = await newUser();
    await login({ email: u.email, password: "Secret123!" }, req());
    await requestPasswordReset(u.email, "en", req());
    await requestPasswordReset("nobody@example.com", "en", req()); // same answer, nothing sent
    expect(sent.filter((m) => m.to === "nobody@example.com")).toHaveLength(0);
    const token = lastToken(u.email);
    expect(token.length).toBeGreaterThan(20);
    const stored = (await listOutbox()).find((m) => m.to[0] === u.email && /Reset/.test(m.subject))!;
    expect(stored.text).not.toContain(token);
    await expect(resetPassword(token, "short", req())).rejects.toThrow("weakPassword");
    const r = await resetPassword(token, "NewSecret-45", req());
    expect(r.status).toBe("ok");
    await expect(resetPassword(token, "Another-456", req())).rejects.toThrow("expired");
    expect((await listSessions(u.id))).toHaveLength(1); // only the new one
    await expect(login({ email: u.email, password: "Secret123!" }, req())).rejects.toThrow("invalid");
    expect((await login({ email: u.email, password: "NewSecret-45" }, req())).status).toBe("ok");
    expect((await getUserById(u.id))!.emailVerifiedAt).toBeTruthy();
  });

  it("changes the password with the current one and keeps only this device", async () => {
    const u = await newUser();
    await login({ email: u.email, password: "Secret123!" }, req());
    await login({ email: u.email, password: "Secret123!" }, req());
    const s = await currentSession();
    await expect(changePassword(u.id, s!.sessionId, "bad", "Another-456")).rejects.toThrow("wrongPassword");
    await expect(changePassword(u.id, s!.sessionId, "Secret123!", "Secret123!")).rejects.toThrow("samePassword");
    await changePassword(u.id, s!.sessionId, "Secret123!", "Another-456");
    const left = await listSessions(u.id);
    expect(left.map((x) => x.id)).toEqual([s!.sessionId]);
  });
});

describe("account: email and phone", () => {
  it("verifies the email and changes it after confirmation from the new address", async () => {
    const u = await newUser();
    await sendEmailVerification(u.id, "ar", req());
    expect(await verifyEmail(lastToken(u.email))).toBe("verified");
    expect((await getUserById(u.id))!.emailVerifiedAt).toBeTruthy();
    await expect(sendEmailVerification(u.id, "ar", req())).rejects.toThrow("alreadyVerified");

    const other = await newUser();
    await expect(requestEmailChange(u.id, "Secret123!", other.email, "ar", req())).rejects.toThrow("exists");
    await expect(requestEmailChange(u.id, "nope", "new@example.org", "ar", req())).rejects.toThrow("wrongPassword");
    const next = `n${randomUUID().slice(0, 6)}@example.org`;
    await requestEmailChange(u.id, "Secret123!", next, "ar", req());
    expect((await getUserById(u.id))!.email).toBe(u.email); // not before confirmation
    expect(await verifyEmail(lastToken(next))).toBe("changed");
    expect((await getUserById(u.id))!.email).toBe(next);
    expect((await getUserByEmail(next))!.id).toBe(u.id);
    expect(await getUserByEmail(u.email)).toBeNull();
    expect(sent.some((m) => m.to === u.email && m.text.includes(next))).toBe(true);
  });

  it("verifies the mobile number with a code (sandbox 123456)", async () => {
    const u = await newUser();
    const r = await sendPhoneCode(u.id);
    expect(r).toMatchObject({ sandbox: true, phone: "+966501234567" });
    await expect(sendPhoneCode(u.id)).rejects.toThrow("tooSoon");
    await expect(confirmPhone(u.id, "000000")).rejects.toThrow("wrongCode");
    await confirmPhone(u.id, "123456");
    const x = (await getUserById(u.id))!;
    expect(x.phoneVerifiedAt).toBeTruthy();
    expect(x.verifiedPhone).toBe("+966501234567");
  });
});

describe("account: two-step verification", () => {
  it("computes RFC 6238 codes", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1_111_111_109_000)).toBe("081804");
    expect(verifyTotp(secret, "081804", 1_111_111_109_000 + 25_000)).toBe(true);
    expect(verifyTotp(secret, "081804", 1_111_111_109_000 + 95_000)).toBe(false);
  });

  it("turns on, asks for the second step at sign-in, accepts a recovery code once, and turns off", async () => {
    const u = await newUser();
    const setup = await beginMfa(u.id);
    expect(setup.qr).toMatch(/^data:image\/png;base64,/);
    expect(setup.uri).toContain(`secret=${setup.secret}`);
    await expect(enableMfa(u.id, "Secret123!", setup.secret, "000000")).rejects.toThrow("wrongCode");
    const codes = await enableMfa(u.id, "Secret123!", setup.secret, totpAt(setup.secret, Date.now()));
    expect(codes).toHaveLength(10);
    expect(JSON.stringify(await getUserById(u.id))).not.toContain(setup.secret); // stored encrypted

    const r = await login({ email: u.email, password: "Secret123!" }, req());
    expect(r.status).toBe("mfa");
    const ticket = (r as { ticket: string }).ticket;
    await expect(completeMfa(ticket, "000000", req())).rejects.toThrow("wrongCode");
    const user = await completeMfa(ticket, totpAt(setup.secret, Date.now()), req());
    expect(user.mfaEnabled).toBe(true);
    await expect(completeMfa(ticket, totpAt(setup.secret, Date.now()), req())).rejects.toThrow("expired");

    const r2 = await login({ email: u.email, password: "Secret123!" }, req());
    await completeMfa((r2 as { ticket: string }).ticket, codes[0].toUpperCase(), req());
    const r3 = await login({ email: u.email, password: "Secret123!" }, req());
    await expect(completeMfa((r3 as { ticket: string }).ticket, codes[0], req())).rejects.toThrow("wrongCode"); // used

    await disableMfa(u.id, "Secret123!", codes[1]);
    expect((await getUserById(u.id))!.mfa).toBeUndefined();
    expect((await login({ email: u.email, password: "Secret123!" }, req())).status).toBe("ok");
  });
});

describe("account: data", () => {
  it("exports the account's records without secrets", async () => {
    const u = await newUser();
    await login({ email: u.email, password: "Secret123!" }, req());
    await store().put("favorites", `f-${u.id}`, { id: `f-${u.id}`, userId: u.id, placeId: "p1" });
    const d = await exportData(u.id);
    expect((d.account as { email: string }).email).toBe(u.email);
    expect(d.favorites).toHaveLength(1);
    expect(d.sessions).toHaveLength(1);
    const text = JSON.stringify(d);
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("deviceKey");
  });

  it("deletes the account but not while a trip is upcoming", async () => {
    const u = await newUser();
    await login({ email: u.email, password: "Secret123!" }, req());
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    await store().put("bookings", `b-${u.id}`, { id: `b-${u.id}`, userId: u.id, status: "COMPLETED", criteria: { returnDate: future } });
    await expect(deleteAccount(u.id, "Secret123!", undefined)).rejects.toThrow("activeTrip");
    await store().update("bookings", `b-${u.id}`, (b: object) => ({ ...b, status: "CANCELLED" }));
    await store().put("travellers", `t-${u.id}`, { id: `t-${u.id}`, userId: u.id });
    await expect(deleteAccount(u.id, "wrong", undefined)).rejects.toThrow("wrongPassword");
    await deleteAccount(u.id, "Secret123!", undefined);
    const x = (await getUserById(u.id))!;
    expect(x.deletedAt).toBeTruthy();
    expect(x.individual).toBeUndefined();
    expect(await getUserByEmail(u.email)).toBeNull();
    expect(await store().get("travellers", `t-${u.id}`)).toBeNull();
    expect(await store().get("bookings", `b-${u.id}`)).not.toBeNull(); // financial record kept
    expect(await listSessions(u.id)).toHaveLength(0);
    await expect(login({ email: u.email, password: "Secret123!" }, req())).rejects.toThrow("invalid");
    // The email can be used again.
    expect(await newUser({ email: u.email })).toBeTruthy();
  });

  it("describes devices", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0")).toBe("Edge · Windows");
  });
});
