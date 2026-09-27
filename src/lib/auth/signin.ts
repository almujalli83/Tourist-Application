/**
 * Sign-in and sign-up with other methods: mobile number (SMS code), Google, Apple and Nafath.
 * A known identity signs in to its account; a new one either joins the account with the same
 * verified email (Google / Apple) or completes a short sign-up form.
 */
import { randomUUID } from "node:crypto";
import { decryptJson, encryptJson } from "../data-crypto";
import { ensureAccount } from "../loyalty/loyalty";
import { validatePhone } from "../phone";
import { createUser, getUserByEmail, getUserById, updateUser } from "../repo";
import { AccountError, loginVerified, sendEmailVerification, type LoginResult } from "./account";
import { findIdentity, hashSubject, identityId, linkIdentity, listIdentities, maskTail, unlinkIdentity, type IdentityProvider } from "./identities";
import { nafathRequest, nafathStatus, NafathError, validNationalId } from "./nafath";
import type { LoginMethod } from "./sessions";
import { checkCode, sendCode, SmsError } from "./sms";
import { clientIp, hit, lockedFor, RULES } from "./throttle";
import { consumeToken, issueToken, peekToken } from "./tokens";
import type { StoredUser } from "./types";
import { EMAIL_RE } from "./validation";

export type SignInOutcome = LoginResult | { status: "signup"; ticket: string } | { status: "linked" };

interface Found {
  provider: IdentityProvider;
  subject: string;
  label: string;
  sandbox: boolean;
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  phone?: string | null;
  nationality?: string | null;
}

const SIGNUP_TTL = 30 * 60_000;

async function guard(key: string, rule = RULES.code) {
  const m = await lockedFor(key, rule);
  if (m) throw new AccountError("tooManyAttempts", m);
}

async function newUser(f: { email: string; fullName: string; phone: string; nationality: string; locale: "ar" | "en"; emailVerified: boolean; phoneVerified: boolean }): Promise<StoredUser> {
  const now = new Date().toISOString();
  const u = await createUser({
    id: randomUUID(), email: f.email, passwordHash: "", hasPassword: false, accountType: "individual",
    individual: { fullName: f.fullName, phone: f.phone, nationality: f.nationality },
    preferredLocale: f.locale, preferredCurrency: "SAR", createdAt: now,
    ...(f.emailVerified ? { emailVerifiedAt: now } : {}),
    ...(f.phoneVerified && f.phone ? { phoneVerifiedAt: now, verifiedPhone: f.phone } : {}),
  });
  if (!u) throw new AccountError("exists");
  await ensureAccount(u.id);
  return u;
}

const methodOf = (p: IdentityProvider): LoginMethod => (p === "phone" ? "otp" : p);

/** Signs in, links, or starts sign-up for an identity confirmed by a provider. */
export async function resolveIdentity(f: Found, req: Request, opts: { mode: "login" | "link"; userId?: string | null; locale: "ar" | "en"; remember?: boolean }): Promise<SignInOutcome> {
  const id = identityId(f.provider, f.subject, f.sandbox);
  const existing = await findIdentity(id);
  if (opts.mode === "link") {
    if (!opts.userId) throw new AccountError("unauthorized");
    if (existing && existing.userId !== opts.userId) throw new AccountError("identityTaken");
    await linkIdentity({ id, userId: opts.userId, provider: f.provider, label: f.label, ...(f.sandbox ? { sandbox: true } : {}) });
    return { status: "linked" };
  }
  if (existing) {
    const u = await getUserById(existing.userId);
    if (u && !u.deletedAt) return loginVerified(u, methodOf(f.provider), req, opts.remember !== false);
    await unlinkIdentity(existing.userId, id);
  }
  // A verified email from Google or Apple joins the account with that email.
  if (!f.sandbox && f.email && f.emailVerified) {
    const u = await getUserByEmail(f.email);
    if (u && !u.deletedAt) {
      await linkIdentity({ id, userId: u.id, provider: f.provider, label: f.label });
      if (!u.emailVerifiedAt) await updateUser(u.id, (x) => ({ ...x, emailVerifiedAt: new Date().toISOString() }));
      return loginVerified(u, methodOf(f.provider), req, opts.remember !== false);
    }
  }
  // With an email and a name (Google / Apple) the account is created at once.
  if ((f.provider === "google" || f.provider === "apple") && f.email) {
    if (await getUserByEmail(f.email)) throw new AccountError("exists");
    const u = await newUser({ email: f.email, fullName: f.name || f.email.split("@")[0], phone: "", nationality: "", locale: opts.locale, emailVerified: f.emailVerified === true, phoneVerified: false });
    await linkIdentity({ id, userId: u.id, provider: f.provider, label: f.label, ...(f.sandbox ? { sandbox: true } : {}) });
    if (!u.emailVerifiedAt) await sendEmailVerification(u.id, opts.locale, req).catch(() => undefined);
    return loginVerified(u, methodOf(f.provider), req, opts.remember !== false);
  }
  const ticket = await issueToken("signup", "pending", SIGNUP_TTL, {
    provider: f.provider, subject: f.subject, label: f.label, sandbox: f.sandbox,
    ...(f.name ? { name: f.name } : {}), ...(f.email ? { email: f.email } : {}), emailVerified: f.emailVerified === true,
    ...(f.phone ? { phone: f.phone } : {}), ...(f.nationality ? { nationality: f.nationality } : {}),
  });
  return { status: "signup", ticket };
}

/* ---------------------------------------------------------------- sign-up completion */

export async function signupPrefill(ticket: unknown) {
  const t = await peekToken("signup", String(ticket ?? ""));
  if (!t) return null;
  const d = t.data ?? {};
  return { provider: String(d.provider), name: d.name ?? "", email: d.email ?? "", phone: d.phone ?? "", nationality: d.nationality ?? "", phoneFixed: d.provider === "phone" };
}

export async function completeSignup(input: { ticket?: unknown; fullName?: unknown; email?: unknown; phone?: unknown; nationality?: unknown; locale?: unknown; remember?: unknown }, req: Request): Promise<LoginResult> {
  const t = await peekToken("signup", String(input.ticket ?? ""));
  if (!t) throw new AccountError("expired");
  const d = t.data ?? {};
  const locale = input.locale === "en" ? "en" : "ar";
  const fullName = typeof input.fullName === "string" ? input.fullName.trim().slice(0, 80) : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const nationality = typeof input.nationality === "string" ? input.nationality.trim().toUpperCase().slice(0, 2) : "";
  const phone = d.provider === "phone" ? String(d.phone) : typeof input.phone === "string" ? input.phone.trim() : "";
  if (!fullName) throw new AccountError("required");
  if (!EMAIL_RE.test(email)) throw new AccountError("email");
  if (validatePhone(phone, nationality || undefined)) throw new AccountError("phone");
  if (await getUserByEmail(email)) throw new AccountError("exists");
  if (!(await consumeToken("signup", String(input.ticket)))) throw new AccountError("expired");
  const provider = String(d.provider) as IdentityProvider;
  const u = await newUser({
    email, fullName, phone, nationality, locale,
    emailVerified: d.emailVerified === true && d.email === email,
    phoneVerified: provider === "phone",
  });
  await linkIdentity({ id: identityId(provider, String(d.subject), d.sandbox === true), userId: u.id, provider, label: String(d.label), ...(d.sandbox === true ? { sandbox: true } : {}) });
  if (!u.emailVerifiedAt) await sendEmailVerification(u.id, locale, req).catch(() => undefined);
  return loginVerified(u, methodOf(provider), req, input.remember !== false);
}

/* ---------------------------------------------------------------- mobile number */

export async function sendLoginCode(phoneIn: unknown, req: Request): Promise<{ sandbox: boolean }> {
  const phone = typeof phoneIn === "string" ? phoneIn.replace(/[\s-]/g, "") : "";
  if (validatePhone(phone)) throw new AccountError("phone");
  const ip = `smsip:${clientIp(req)}`;
  await guard(`smslogin:${phone}`, RULES.send);
  await guard(ip, RULES.loginIp);
  await hit(`smslogin:${phone}`, RULES.send);
  await hit(ip, RULES.loginIp);
  try {
    return await sendCode("login", phone, (c) => `Saudi Trip: ${c} رمز الدخول / sign-in code`);
  } catch (e) {
    if (e instanceof SmsError) throw new AccountError(e.message);
    throw e;
  }
}

export async function verifyLoginCode(phoneIn: unknown, code: unknown, req: Request, opts: { locale: "ar" | "en"; remember?: boolean }): Promise<SignInOutcome> {
  const phone = typeof phoneIn === "string" ? phoneIn.replace(/[\s-]/g, "") : "";
  await guard(`smscheck:${phone}`);
  const r = await checkCode("login", phone, String(code ?? ""));
  if (r !== "ok") {
    await hit(`smscheck:${phone}`, RULES.code);
    throw new AccountError(r === "expired" ? "expired" : "wrongCode");
  }
  return resolveIdentity({ provider: "phone", subject: phone, label: maskTail(phone), sandbox: false, phone }, req, { mode: "login", locale: opts.locale, remember: opts.remember });
}

/** The verified mobile number also signs in to the account (when not used by another account). */
export async function linkVerifiedPhone(userId: string, phone: string): Promise<void> {
  for (const i of await listIdentities(userId)) if (i.provider === "phone" && i.id !== identityId("phone", phone)) await unlinkIdentity(userId, i.id);
  await linkIdentity({ id: identityId("phone", phone), userId, provider: "phone", label: maskTail(phone) });
}

/* ---------------------------------------------------------------- Nafath */

export async function startNafath(idIn: unknown, locale: "ar" | "en", req: Request, opts: { mode: "login" | "link"; userId?: string | null }): Promise<{ ticket: string; random: string; sandbox: boolean }> {
  const nationalId = typeof idIn === "string" ? idIn.trim() : "";
  if (!validNationalId(nationalId)) throw new AccountError("nationalId");
  if (opts.mode === "link" && !opts.userId) throw new AccountError("unauthorized");
  const ip = `nafip:${clientIp(req)}`;
  await guard(`nafath:${hashSubject(nationalId)}`, RULES.send);
  await guard(ip, RULES.loginIp);
  await hit(`nafath:${hashSubject(nationalId)}`, RULES.send);
  await hit(ip, RULES.loginIp);
  try {
    const r = await nafathRequest(nationalId, locale);
    const ticket = await issueToken("nafath", opts.userId ?? "pending", 3 * 60_000, {
      transId: r.transId, random: r.random, nid: encryptJson(nationalId), startedAt: String(Date.now()), mode: opts.mode, sandbox: r.sandbox, locale,
    });
    return { ticket, random: r.random, sandbox: r.sandbox };
  } catch (e) {
    if (e instanceof NafathError) throw new AccountError(e.message === "invalidId" ? "nationalId" : "nafathUnavailable");
    throw e;
  }
}

/** Polled by the page until the person approves (or rejects) in the Nafath app. */
export async function pollNafath(ticket: unknown, req: Request, currentUserId: string | null): Promise<SignInOutcome | { status: "waiting" }> {
  const t = await peekToken("nafath", String(ticket ?? ""));
  if (!t) throw new AccountError("expired");
  const d = t.data ?? {};
  const nationalId = decryptJson<string>(String(d.nid));
  if (!nationalId) throw new AccountError("expired");
  const r = await nafathStatus(nationalId, String(d.transId), String(d.random), Number(d.startedAt));
  if (r.status === "WAITING") return { status: "waiting" };
  if (!(await consumeToken("nafath", String(ticket)))) throw new AccountError("expired");
  if (r.status !== "COMPLETED") throw new AccountError(r.status === "REJECTED" ? "nafathRejected" : "expired");
  const mode = d.mode === "link" ? "link" : "login";
  if (mode === "link" && (!currentUserId || currentUserId !== t.userId)) throw new AccountError("unauthorized");
  const locale = d.locale === "en" ? "en" : "ar";
  return resolveIdentity({
    provider: "nafath", subject: hashSubject(nationalId), label: maskTail(nationalId), sandbox: d.sandbox === true,
    name: (locale === "ar" ? r.person?.fullNameAr : r.person?.fullNameEn) ?? r.person?.fullNameEn ?? r.person?.fullNameAr ?? null,
    nationality: r.person?.nationality ?? (nationalId.startsWith("1") ? "SA" : null),
  }, req, { mode, userId: currentUserId, locale });
}

/* ---------------------------------------------------------------- linked methods */

export async function signInMethods(userId: string) {
  const u = await getUserById(userId);
  return {
    password: u?.hasPassword !== false,
    identities: (await listIdentities(userId)).map((i) => ({ id: i.id, provider: i.provider, label: i.label, sandbox: !!i.sandbox, createdAt: i.createdAt })),
  };
}

/** Removes a sign-in method, keeping at least one way to sign in. */
export async function unlinkMethod(userId: string, id: string): Promise<void> {
  const u = await getUserById(userId);
  const ids = await listIdentities(userId);
  if (!ids.some((i) => i.id === id)) throw new AccountError("notFound");
  if (u?.hasPassword === false && ids.length <= 1) throw new AccountError("lastMethod");
  await unlinkIdentity(userId, id);
}


