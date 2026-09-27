/**
 * Account services: sign-in (with limits and two-step verification), password reset and change,
 * email verification and change, phone verification, two-step verification, signed-in devices,
 * a copy of the account's data and account deletion.
 */
import QRCode from "qrcode";
import { decryptJson, encryptJson } from "../data-crypto";
import { notifyTravellers } from "../notify";
import { phoneOf } from "./phone-of";
import { getUserByEmail, getUserById, updateUser } from "../repo";
import { siteUrl } from "../site";
import { store } from "../store";
import type { Collection } from "../store/types";
import { deleteWalletDocument, getWalletDoc } from "../wallet";
import { removeUserIdentities } from "./identities";
import { hashPassword, verifyPassword } from "./password";
import { linkVerifiedPhone } from "./signin";
import { knownDevice, deviceKeyOf, revokeAllSessions, type LoginMethod } from "./sessions";
import { clearSessionCookie, setSessionCookie } from "./session";
import { checkCode, sendCode, SmsError } from "./sms";
import { clearHits, clientIp, hit, lockedFor, RULES } from "./throttle";
import { consumeToken, issueToken, peekToken, voidTokens } from "./tokens";
import { hashRecovery, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { toPublicUser, type PublicUser, type StoredUser } from "./types";
import { EMAIL_RE } from "./validation";

export class AccountError extends Error {
  constructor(code: string, public minutes?: number) {
    super(code);
  }
}

type Locale = "ar" | "en";
const RESET_TTL = 30 * 60_000;
const VERIFY_TTL = 48 * 3600_000;
const CHANGE_TTL = 60 * 60_000;
const MFA_TTL = 5 * 60_000;

/** Password rules: 8–128 characters, not only one repeated character, not the email. */
export function passwordProblem(pw: unknown, email?: string): string | null {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 128) return "weakPassword";
  if (/^(.)\1+$/.test(pw) || (email && pw.toLowerCase() === email.toLowerCase())) return "weakPassword";
  if (["12345678", "123456789", "password", "password1", "qwertyui", "11111111"].includes(pw.toLowerCase())) return "weakPassword";
  return null;
}

const mustUser = async (id: string) => {
  const u = await getUserById(id);
  if (!u || u.deletedAt) throw new AccountError("unauthorized");
  return u;
};

async function checkPassword(u: StoredUser, password: unknown) {
  if (u.hasPassword === false) return; // accounts without a password (Google, Nafath, mobile)
  if (typeof password !== "string" || !(await verifyPassword(password, u.passwordHash))) {
    await hit(`pw:${u.id}`, RULES.code);
    throw new AccountError("wrongPassword");
  }
}

async function guard(key: string, rule = RULES.code) {
  const m = await lockedFor(key, rule);
  if (m) throw new AccountError("tooManyAttempts", m);
}

/* ---------------------------------------------------------------- emails */

function mail(u: Pick<StoredUser, "email">, subject: { en: string; ar: string }, en: string[], ar: string[], redact: string[] = []) {
  return notifyTravellers([u.email], { subject: `Saudi Trip — ${subject.en} / ${subject.ar}`, text: [...en, "", ...ar].join("\n") }, { redact });
}

const link = (req: Request | undefined, locale: Locale, path: string) => `${siteUrl(req)}/${locale}${path}`;

/* ---------------------------------------------------------------- sign-in */

async function startSession(u: StoredUser, method: LoginMethod, remember: boolean, req?: Request): Promise<PublicUser> {
  const ua = req?.headers.get("user-agent") ?? "";
  const known = method === "register" || (await knownDevice(u.id, deviceKeyOf(ua)));
  const s = await setSessionCookie(u.id, { remember, method });
  if (!known) {
    const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    await mail(u, { en: "New sign-in", ar: "تسجيل دخول جديد" },
      [`Your account was signed in on a new device: ${s.device}, ${when}.`, "If this wasn't you, reset your password and sign out all devices from Account security."],
      [`تم تسجيل الدخول إلى حسابك من جهاز جديد: ${s.device}، ${when}.`, "إن لم تكن أنت، أعد تعيين كلمة المرور وسجّل الخروج من جميع الأجهزة من «أمان الحساب»."]);
  }
  return toPublicUser(u);
}

export type LoginResult = { status: "ok"; user: PublicUser } | { status: "mfa"; ticket: string };

/** Email and password; a second step when two-step verification is on. */
export async function login(input: { email?: unknown; password?: unknown; remember?: unknown }, req: Request): Promise<LoginResult> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const ipKey = `ip:${clientIp(req)}`;
  await guard(`login:${email}`, RULES.login);
  await guard(ipKey, RULES.loginIp);
  const u = email ? await getUserByEmail(email) : null;
  const ok = !!u && !u.deletedAt && u.hasPassword !== false && typeof input.password === "string" && (await verifyPassword(input.password, u.passwordHash));
  if (!ok) {
    await hit(`login:${email}`, RULES.login);
    await hit(ipKey, RULES.loginIp);
    throw new AccountError("invalid");
  }
  await clearHits(`login:${email}`);
  const remember = input.remember !== false;
  if (u.mfa) return { status: "mfa", ticket: await issueToken("mfaLogin", u.id, MFA_TTL, { remember, method: "password" }) };
  return { status: "ok", user: await startSession(u, "password", remember, req) };
}

/** Second step: a code from the authenticator app, or a recovery code. */
export async function completeMfa(ticket: unknown, code: unknown, req: Request): Promise<PublicUser> {
  const t = await peekToken("mfaLogin", String(ticket ?? ""));
  if (!t) throw new AccountError("expired");
  await guard(`mfa:${t.userId}`);
  const u = await mustUser(t.userId);
  if (!u.mfa || !(await checkSecondFactor(u, code))) {
    await hit(`mfa:${t.userId}`, RULES.code);
    throw new AccountError("wrongCode");
  }
  if (!(await consumeToken("mfaLogin", String(ticket)))) throw new AccountError("expired");
  await clearHits(`mfa:${t.userId}`);
  return startSession(u, (t.data?.method as LoginMethod) ?? "password", t.data?.remember !== false, req);
}

/** Checks an authenticator code or uses up a recovery code. */
async function checkSecondFactor(u: StoredUser, code: unknown): Promise<boolean> {
  if (!u.mfa || typeof code !== "string") return false;
  const secret = decryptJson<string>(u.mfa.secret);
  if (secret && verifyTotp(secret, code)) return true;
  const h = hashRecovery(code);
  if (code.replace(/[^a-z0-9]/gi, "").length === 8 && u.mfa.recovery.includes(h)) {
    await updateUser(u.id, (x) => (x.mfa ? { ...x, mfa: { ...x.mfa, recovery: x.mfa.recovery.filter((r) => r !== h) } } : x));
    return true;
  }
  return false;
}

/** Sign-in for other methods (Google, Apple, Nafath, mobile): the same second step and alerts. */
export async function loginVerified(u: StoredUser, method: LoginMethod, req: Request, remember = true): Promise<LoginResult> {
  if (u.deletedAt) throw new AccountError("invalid");
  if (u.mfa) return { status: "mfa", ticket: await issueToken("mfaLogin", u.id, MFA_TTL, { remember, method }) };
  return { status: "ok", user: await startSession(u, method, remember, req) };
}

/* ---------------------------------------------------------------- registration */

export async function afterRegister(u: StoredUser, locale: Locale, req: Request): Promise<PublicUser> {
  await setSessionCookie(u.id, { method: "register" });
  await sendEmailVerification(u.id, locale, req).catch(() => undefined);
  return toPublicUser(u);
}

/* ---------------------------------------------------------------- password */

/** Always answers the same (whether or not the email has an account). */
export async function requestPasswordReset(emailIn: unknown, locale: Locale, req: Request): Promise<void> {
  const email = typeof emailIn === "string" ? emailIn.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new AccountError("email");
  await guard(`reset:${email}`, RULES.send);
  await hit(`reset:${email}`, RULES.send);
  const u = await getUserByEmail(email);
  if (!u || u.deletedAt) return;
  await voidTokens(u.id, "reset");
  const token = await issueToken("reset", u.id, RESET_TTL);
  const url = link(req, locale, `/reset-password?token=${token}`);
  await mail(u, { en: "Reset your password", ar: "إعادة تعيين كلمة المرور" },
    ["To choose a new password, open this link within 30 minutes:", url, "If you didn't ask for this, ignore this email; your password stays the same."],
    ["لاختيار كلمة مرور جديدة افتح هذا الرابط خلال 30 دقيقة:", url.replace(`/${locale}/`, "/ar/"), "إن لم تطلب ذلك فتجاهل هذه الرسالة، وستبقى كلمة المرور كما هي."],
    [token]);
}

export async function checkResetToken(token: unknown): Promise<boolean> {
  return !!(await peekToken("reset", String(token ?? "")));
}

/** New password from a reset link: every device is signed out, then this one is signed in. */
export async function resetPassword(token: unknown, password: unknown, req: Request): Promise<LoginResult> {
  const t = await peekToken("reset", String(token ?? ""));
  if (!t) throw new AccountError("expired");
  const u = await mustUser(t.userId);
  const p = passwordProblem(password, u.email);
  if (p) throw new AccountError(p);
  if (!(await consumeToken("reset", String(token)))) throw new AccountError("expired");
  const hash = await hashPassword(password as string);
  const updated = (await updateUser(u.id, (x) => ({
    ...x, passwordHash: hash, hasPassword: true, passwordChangedAt: new Date().toISOString(),
    // Opening the link proves the address.
    emailVerifiedAt: x.emailVerifiedAt ?? new Date().toISOString(),
  })))!;
  await revokeAllSessions(u.id);
  await voidTokens(u.id, "reset");
  await passwordChangedMail(updated);
  return loginVerified(updated, "reset", req);
}

async function passwordChangedMail(u: StoredUser) {
  await mail(u, { en: "Your password was changed", ar: "تم تغيير كلمة المرور" },
    ["The password of your Saudi Trip account was changed and all other devices were signed out.", "If this wasn't you, reset your password now and contact support."],
    ["تم تغيير كلمة مرور حسابك في سعودي تريب وتسجيل الخروج من الأجهزة الأخرى.", "إن لم تكن أنت، أعد تعيين كلمة المرور فورًا وتواصل مع الدعم."]);
}

export async function changePassword(userId: string, sessionId: string, current: unknown, next: unknown): Promise<void> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  await checkPassword(u, current);
  const p = passwordProblem(next, u.email);
  if (p) throw new AccountError(p);
  if (typeof current === "string" && current === next) throw new AccountError("samePassword");
  const hash = await hashPassword(next as string);
  await updateUser(u.id, (x) => ({ ...x, passwordHash: hash, hasPassword: true, passwordChangedAt: new Date().toISOString() }));
  await revokeAllSessions(u.id, sessionId);
  await voidTokens(u.id, "reset");
  await passwordChangedMail(u);
}

/* ---------------------------------------------------------------- email */

export async function sendEmailVerification(userId: string, locale: Locale, req: Request): Promise<void> {
  const u = await mustUser(userId);
  if (u.emailVerifiedAt) throw new AccountError("alreadyVerified");
  await guard(`verify:${u.id}`, RULES.send);
  await hit(`verify:${u.id}`, RULES.send);
  await voidTokens(u.id, "verifyEmail");
  const token = await issueToken("verifyEmail", u.id, VERIFY_TTL, { email: u.email });
  const url = link(req, locale, `/verify-email?token=${token}`);
  await mail(u, { en: "Confirm your email", ar: "تأكيد البريد الإلكتروني" },
    ["Welcome to Saudi Trip. Confirm your email address with this link (valid 48 hours):", url],
    ["أهلًا بك في سعودي تريب. أكّد بريدك الإلكتروني عبر هذا الرابط (صالح 48 ساعة):", url.replace(`/${locale}/`, "/ar/")],
    [token]);
}

export async function verifyEmail(token: unknown): Promise<"verified" | "changed"> {
  const raw = String(token ?? "");
  const verify = await consumeToken("verifyEmail", raw);
  if (verify) {
    const u = await mustUser(verify.userId);
    if (u.email !== verify.data?.email) throw new AccountError("expired");
    await updateUser(u.id, (x) => ({ ...x, emailVerifiedAt: x.emailVerifiedAt ?? new Date().toISOString() }));
    return "verified";
  }
  const change = await consumeToken("changeEmail", raw);
  if (!change) throw new AccountError("expired");
  const u = await mustUser(change.userId);
  const next = String(change.data?.email ?? "");
  if (!(await store().insert("userEmails", next, { userId: u.id }))) throw new AccountError("exists");
  await store().delete("userEmails", u.email.toLowerCase());
  const old = u.email;
  await updateUser(u.id, (x) => ({ ...x, email: next, emailVerifiedAt: new Date().toISOString() }));
  await mail({ email: old }, { en: "Your email was changed", ar: "تم تغيير البريد الإلكتروني" },
    [`The email of your Saudi Trip account is now ${next}.`, "If this wasn't you, contact support immediately."],
    [`أصبح البريد الإلكتروني لحسابك في سعودي تريب: ${next}.`, "إن لم تكن أنت، تواصل مع الدعم فورًا."]);
  return "changed";
}

/** A new email takes effect once confirmed from that address. */
export async function requestEmailChange(userId: string, password: unknown, emailIn: unknown, locale: Locale, req: Request): Promise<void> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  await checkPassword(u, password);
  const email = typeof emailIn === "string" ? emailIn.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new AccountError("email");
  if (email === u.email) throw new AccountError("sameEmail");
  if (await getUserByEmail(email)) throw new AccountError("exists");
  await guard(`change:${u.id}`, RULES.send);
  await hit(`change:${u.id}`, RULES.send);
  await voidTokens(u.id, "changeEmail");
  const token = await issueToken("changeEmail", u.id, CHANGE_TTL, { email });
  const url = link(req, locale, `/verify-email?token=${token}`);
  await mail({ email }, { en: "Confirm your new email", ar: "تأكيد البريد الإلكتروني الجديد" },
    ["Confirm this address for your Saudi Trip account with this link (valid 1 hour):", url],
    ["أكّد هذا البريد لحسابك في سعودي تريب عبر هذا الرابط (صالح ساعة واحدة):", url.replace(`/${locale}/`, "/ar/")],
    [token]);
  await mail(u, { en: "Email change requested", ar: "طلب تغيير البريد الإلكتروني" },
    [`A change of your account email to ${email} was requested. It takes effect only when confirmed from the new address.`],
    [`طُلب تغيير بريد حسابك إلى ${email}، ولن يتم إلا بعد تأكيده من البريد الجديد.`]);
}

/* ---------------------------------------------------------------- phone */

export async function sendPhoneCode(userId: string): Promise<{ sandbox: boolean; phone: string }> {
  const u = await mustUser(userId);
  const phone = phoneOf(u);
  if (!phone) throw new AccountError("phone");
  if (u.phoneVerifiedAt && u.verifiedPhone === phone) throw new AccountError("alreadyVerified");
  await guard(`sms:${u.id}`, RULES.send);
  await hit(`sms:${u.id}`, RULES.send);
  try {
    const r = await sendCode(`verify:${u.id}`, phone, (c) => `Saudi Trip: ${c} رمز التحقق / verification code`);
    return { ...r, phone };
  } catch (e) {
    if (e instanceof SmsError) throw new AccountError(e.message);
    throw e;
  }
}

export async function confirmPhone(userId: string, code: unknown): Promise<void> {
  await guard(`smscode:${userId}`);
  const u = await mustUser(userId);
  const phone = phoneOf(u);
  if (!phone) throw new AccountError("phone");
  const r = await checkCode(`verify:${u.id}`, phone, String(code ?? ""));
  if (r !== "ok") {
    await hit(`smscode:${userId}`, RULES.code);
    throw new AccountError(r === "expired" ? "expired" : "wrongCode");
  }
  await updateUser(u.id, (x) => ({ ...x, phoneVerifiedAt: new Date().toISOString(), verifiedPhone: phone }));
  await linkVerifiedPhone(u.id, phone).catch(() => undefined);
}

/* ---------------------------------------------------------------- two-step verification */

export async function beginMfa(userId: string): Promise<{ secret: string; uri: string; qr: string }> {
  const u = await mustUser(userId);
  if (u.mfa) throw new AccountError("mfaOn");
  const secret = newTotpSecret();
  const uri = otpauthUrl(secret, u.email);
  return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** Turns two-step verification on once a code from the app matches; returns the recovery codes. */
export async function enableMfa(userId: string, password: unknown, secret: unknown, code: unknown): Promise<string[]> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  if (u.mfa) throw new AccountError("mfaOn");
  await checkPassword(u, password);
  if (typeof secret !== "string" || !/^[A-Z2-7]{32}$/.test(secret) || typeof code !== "string" || !verifyTotp(secret, code)) throw new AccountError("wrongCode");
  const { codes, hashes } = newRecoveryCodes();
  await updateUser(u.id, (x) => ({ ...x, mfa: { secret: encryptJson(secret), enabledAt: new Date().toISOString(), recovery: hashes } }));
  await mail(u, { en: "Two-step verification is on", ar: "تم تفعيل التحقق بخطوتين" },
    ["Signing in to your account now also needs a code from your authenticator app."],
    ["أصبح تسجيل الدخول إلى حسابك يتطلب أيضًا رمزًا من تطبيق المصادقة."]);
  return codes;
}

export async function disableMfa(userId: string, password: unknown, code: unknown): Promise<void> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  if (!u.mfa) throw new AccountError("mfaOff");
  await checkPassword(u, password);
  if (!(await checkSecondFactor(u, code))) {
    await hit(`pw:${userId}`, RULES.code);
    throw new AccountError("wrongCode");
  }
  await updateUser(u.id, (x) => {
    const rest = { ...x };
    delete rest.mfa;
    return rest;
  });
  await mail(u, { en: "Two-step verification is off", ar: "تم إيقاف التحقق بخطوتين" },
    ["Two-step verification was turned off for your account. If this wasn't you, reset your password now."],
    ["تم إيقاف التحقق بخطوتين لحسابك. إن لم تكن أنت، أعد تعيين كلمة المرور فورًا."]);
}

export async function newRecovery(userId: string, code: unknown): Promise<string[]> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  if (!u.mfa) throw new AccountError("mfaOff");
  const secret = decryptJson<string>(u.mfa.secret);
  if (!secret || typeof code !== "string" || !verifyTotp(secret, code)) {
    await hit(`pw:${userId}`, RULES.code);
    throw new AccountError("wrongCode");
  }
  const { codes, hashes } = newRecoveryCodes();
  await updateUser(u.id, (x) => (x.mfa ? { ...x, mfa: { ...x.mfa, recovery: hashes } } : x));
  return codes;
}


/* ---------------------------------------------------------------- data copy and deletion */

/** Collections holding a user's records (field "userId"). */
const USER_COLLECTIONS: Collection[] = [
  "bookings", "travellers", "wallet", "favorites", "eventOrders", "trainOrders", "restaurantBookings", "esimOrders", "chats", "tripPlans",
  "notifications", "reviews", "supportTickets", "alertPrefs", "loyalty", "guideBookings", "umrahPermits", "transfers", "rentals",
  "transitOrders", "transitTickets", "transitTopups", "rides", "busOrders", "paymentIntents", "savedCards", "sessions", "userIdentities",
];
const HIDDEN = /^(passwordHash|mfa|hash|secret|token|enc|file|key|deviceKey|providerToken|cardToken|gatewayToken)$/i;

function scrub(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !HIDDEN.test(k)).map(([k, x]) => [k, scrub(x)]));
  return v;
}

/** A copy of everything the platform keeps about the user (personal data protection). */
export async function exportData(userId: string): Promise<Record<string, unknown>> {
  const u = await mustUser(userId);
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), account: scrub(toPublicUser(u)) };
  for (const c of USER_COLLECTIONS) {
    let rows: unknown[] = await store().findBy(c, "userId", userId);
    if (c === "wallet") {
      rows = await Promise.all((rows as { id: string }[]).map(async (r) => {
        const d = await getWalletDoc(userId, r.id);
        return d ? { ...d, file: undefined, hasFile: !!d.file } : null;
      }));
      rows = rows.filter(Boolean);
    }
    if (rows.length) out[c] = scrub(rows);
  }
  return out;
}

/**
 * Deletes the account: personal data, documents, saved travellers and cards, favourites and
 * devices are removed. Bookings and payments stay (financial records) without the profile.
 * Refused while a trip is still upcoming.
 */
export async function deleteAccount(userId: string, password: unknown, code: unknown, now = new Date()): Promise<void> {
  await guard(`pw:${userId}`);
  const u = await mustUser(userId);
  await checkPassword(u, password);
  if (u.mfa && !(await checkSecondFactor(u, code))) throw new AccountError("wrongCode");
  const today = now.toISOString().slice(0, 10);
  const bookings = await store().findBy<{ status: string; criteria: { returnDate: string } }>("bookings", "userId", userId);
  if (bookings.some((b) => b.status !== "CANCELLED" && b.criteria.returnDate >= today)) throw new AccountError("activeTrip");

  for (const r of await store().findBy<{ id: string }>("wallet", "userId", userId)) {
    await deleteWalletDocument(userId, r.id).catch(() => undefined);
    await store().delete("wallet", r.id);
  }
  for (const c of ["travellers", "favorites", "alertPrefs", "notifications", "savedCards", "chats", "tripPlans"] as Collection[]) {
    for (const r of await store().findBy<{ id: string; file?: unknown }>(c, "userId", userId)) await store().delete(c, r.id);
  }
  await revokeAllSessions(userId);
  await removeUserIdentities(userId);
  await store().delete("userEmails", u.email.toLowerCase());
  const email = u.email;
  await store().put<StoredUser>("users", u.id, {
    id: u.id, email: `deleted:${u.id}`, passwordHash: "", hasPassword: false, accountType: u.accountType,
    preferredLocale: u.preferredLocale, preferredCurrency: u.preferredCurrency, createdAt: u.createdAt, deletedAt: now.toISOString(),
  });
  await clearSessionCookie().catch(() => undefined);
  await mail({ email }, { en: "Your account was deleted", ar: "تم حذف حسابك" },
    ["Your Saudi Trip account and personal data were deleted. Records of past bookings and payments are kept as required by law, without your profile."],
    ["تم حذف حسابك وبياناتك الشخصية في سعودي تريب. تُحفظ سجلات الحجوزات والمدفوعات السابقة كما يتطلب النظام، دون بيانات ملفك."]);
}

