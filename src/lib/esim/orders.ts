/**
 * eSIM orders (Tygo): one eSIM per chosen traveller, bought with a package (optional step after
 * activities, not part of the package price) or on its own later. Each traveller receives the
 * installation details at their own email (already known from their saved or visa details); the
 * buyer's «My bookings» keeps the QR codes. Refund per the plan's terms: before activation only.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { displayName, type PublicUser } from "../auth/types";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { listBookingsByUser } from "../repo";
import { getSavedTraveller, listWithKeys } from "../saved-travellers-repo";
import { store } from "../store";
import { getPlan, tygoActivated, tygoCancel, tygoIssue, type EsimPlan } from "./tygo";

export const MAX_ESIMS = 14;

export interface EsimRecipient { name: string; email: string }

export interface EsimLine extends EsimRecipient {
  id: string;
  iccid: string;
  activationCode: string;
  smdpAddress: string;
  matchingId: string;
  phoneNumber: string | null;
}

export interface EsimOrder {
  id: string;
  reference: string;
  orderRef: string;
  userId: string;
  createdAt: string;
  status: "CONFIRMED" | "CANCELLED";
  plan: EsimPlan;
  booking: { id: string; reference: string } | null;
  lines: EsimLine[];
  totalSAR: number;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number };
  cancellation: { at: string; refundSAR: number } | null;
}

export class EsimError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const esimTotal = (plan: EsimPlan, count: number) => round2(plan.priceSAR * count);
const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return d ? `${u.slice(0, 1)}•••@${d}` : e;
};
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/* ---------------------------------------------------------- recipients */

export interface RecipientOption { ref: string; name: string; emailMasked: string }

/** The account holder, saved travellers and the travellers of the account's bookings (with an email). */
export async function recipientOptions(user: PublicUser): Promise<RecipientOption[]> {
  const out: RecipientOption[] = [{ ref: "me", name: displayName(user), emailMasked: maskEmail(user.email) }];
  const seen = new Set([user.email.toLowerCase()]);
  for (const s of await listWithKeys(user.id)) {
    const full = await getSavedTraveller(user.id, s.id);
    if (!full?.email || !validEmail(full.email) || seen.has(`${s.nameEn}|${full.email.toLowerCase()}`)) continue;
    seen.add(`${s.nameEn}|${full.email.toLowerCase()}`);
    out.push({ ref: `saved:${s.id}`, name: s.nameEn, emailMasked: maskEmail(full.email) });
  }
  for (const b of await listBookingsByUser(user.id)) {
    if (b.status === "CANCELLED") continue;
    for (const a of b.applicants) {
      if (!a.email || !validEmail(a.email) || seen.has(`${a.nameEn}|${a.email.toLowerCase()}`)) continue;
      seen.add(`${a.nameEn}|${a.email.toLowerCase()}`);
      out.push({ ref: `booking:${b.id}:${a.applicationNo}`, name: a.nameEn, emailMasked: maskEmail(a.email) });
    }
  }
  return out;
}

async function resolveRecipient(user: PublicUser, ref: string): Promise<EsimRecipient> {
  if (ref === "me") return { name: displayName(user), email: user.email };
  if (ref.startsWith("saved:")) {
    const s = await getSavedTraveller(user.id, ref.slice(6));
    if (s?.email && validEmail(s.email)) return { name: [s.firstNameEn, s.familyNameEn].filter(Boolean).join(" "), email: s.email };
  }
  if (ref.startsWith("booking:")) {
    const [, bookingId, appNo] = ref.split(":");
    const a = (await listBookingsByUser(user.id)).find((b) => b.id === bookingId)?.applicants.find((x) => x.applicationNo === appNo);
    if (a?.email && validEmail(a.email)) return { name: a.nameEn, email: a.email };
  }
  throw new EsimError("invalidRecipient");
}

/* ---------------------------------------------------------- issue */

/** Issues the eSIMs of an already paid order and stores it (used alone and with a package). */
async function issueOrder(user: PublicUser, o: { id: string; plan: EsimPlan; recipients: EsimRecipient[]; payment: EsimOrder["payment"]; booking: EsimOrder["booking"] }): Promise<EsimOrder> {
  const issued = await tygoIssue(o.plan, o.recipients.length);
  const order: EsimOrder = {
    id: o.id,
    reference: `ES-${randomBytes(4).toString("hex").toUpperCase()}`,
    orderRef: issued.orderRef,
    userId: user.id,
    createdAt: new Date().toISOString(),
    status: "CONFIRMED",
    plan: o.plan,
    booking: o.booking,
    lines: o.recipients.map((r, i) => ({ id: randomUUID(), ...r, ...issued.esims[i] })),
    totalSAR: o.payment.amountSAR,
    payment: o.payment,
    cancellation: null,
  };
  if (!(await store().insert("esimOrders", order.id, order))) return (await store().get<EsimOrder>("esimOrders", order.id))!;
  for (const line of order.lines) await notifyTravellers([line.email], installEmail(order, line, user.preferredLocale));
  return order;
}

/** eSIMs chosen in the package booking, paid with the package's card charge. */
export async function issueEsimsForBooking(
  user: PublicUser,
  input: { plan: EsimPlan; recipients: EsimRecipient[]; payment: Omit<EsimOrder["payment"], "amountSAR">; booking: { id: string; reference: string } },
): Promise<EsimOrder> {
  const amountSAR = esimTotal(input.plan, input.recipients.length);
  return issueOrder(user, { id: randomUUID(), plan: input.plan, recipients: input.recipients, payment: { ...input.payment, amountSAR }, booking: input.booking });
}

/** Validates the eSIM part of a package booking (plan + traveller indexes). */
export function validateBookingEsim(esim: { planId?: string; travellers?: number[] } | undefined, travellerCount: number): { plan: EsimPlan; indexes: number[] } | null {
  if (!esim || !esim.travellers?.length) return null;
  const plan = getPlan(esim.planId ?? "");
  const indexes = [...new Set(esim.travellers)];
  if (!plan || indexes.some((i) => !Number.isInteger(i) || i < 0 || i >= travellerCount)) throw new EsimError("invalidEsim");
  return { plan, indexes: indexes.sort((a, b) => a - b) };
}

export interface EsimOrderInput {
  planId: string;
  recipients: string[];
  expectedTotalSAR: number;
  idempotencyKey: string;
  card: CardInput;
}

/** Standalone purchase (after the package, or without one). */
export async function placeEsimOrder(user: PublicUser, input: EsimOrderInput, now = new Date()): Promise<EsimOrder> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new EsimError("idempotencyKey", 400);
  const id = createHash("sha256").update(`${user.id}|esim|${input.idempotencyKey}`).digest("hex").slice(0, 24);
  const existing = await store().get<EsimOrder>("esimOrders", id);
  if (existing) return existing;
  const plan = getPlan(input.planId);
  if (!plan) throw new EsimError("invalidPlan");
  const refs = [...new Set(input.recipients ?? [])];
  if (!refs.length || refs.length > MAX_ESIMS) throw new EsimError("recipientCount");
  const recipients = await Promise.all(refs.map((r) => resolveRecipient(user, r)));
  const total = esimTotal(plan, recipients.length);
  if (Math.abs(total - Number(input.expectedTotalSAR)) > 0.01) throw new EsimError("priceChanged", 409);
  const pay = await chargeCard(input.card, total, now);
  if (!pay.ok) throw new EsimError(`payment_${pay.code}`, 402);
  try {
    return await issueOrder(user, { id, plan, recipients, payment: { transactionId: pay.transactionId, method: pay.method, last4: pay.last4, amountSAR: total }, booking: null });
  } catch (err) {
    await refundPayment(pay.transactionId, total);
    throw err;
  }
}

/* ---------------------------------------------------------- read / cancel */

export async function listEsimOrders(userId: string): Promise<EsimOrder[]> {
  return (await store().findBy<EsimOrder>("esimOrders", "userId", userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEsimOrder(userId: string, id: string): Promise<EsimOrder | null> {
  const o = await store().get<EsimOrder>("esimOrders", id);
  return o && o.userId === userId ? o : null;
}

/** Cancellable while no eSIM of the order has been activated, when the plan allows it. */
export async function canCancelEsim(o: EsimOrder): Promise<boolean> {
  if (o.status !== "CONFIRMED" || !o.plan.refundableBeforeActivation) return false;
  for (const l of o.lines) if (await tygoActivated(l.iccid)) return false;
  return true;
}

export async function cancelEsimOrder(user: PublicUser, id: string, now = new Date()): Promise<EsimOrder> {
  const o = await getEsimOrder(user.id, id);
  if (!o) throw new EsimError("notFound", 404);
  if (!(await canCancelEsim(o))) throw new EsimError("notCancellable");
  let claimed = false;
  await store().update<EsimOrder>("esimOrders", id, (cur) => {
    if (cur.status !== "CONFIRMED") return cur;
    claimed = true;
    return { ...cur, status: "CANCELLED", cancellation: { at: now.toISOString(), refundSAR: cur.totalSAR } };
  });
  if (!claimed) throw new EsimError("notCancellable");
  await refundPayment(o.payment.transactionId, o.totalSAR);
  await tygoCancel(o.orderRef);
  const done = (await getEsimOrder(user.id, id))!;
  await notifyTravellers([user.email], {
    subject: user.preferredLocale === "ar" ? `إلغاء شرائح eSIM — ${o.reference}` : `eSIM order cancelled — ${o.reference}`,
    text: user.preferredLocale === "ar" ? `تم إلغاء طلب الشرائح ${o.reference} وسيُعاد ${o.totalSAR} ريال إلى بطاقتك.` : `eSIM order ${o.reference} has been cancelled. SAR ${o.totalSAR} will be refunded to your card.`,
  });
  return done;
}

/* ---------------------------------------------------------- email */

function installEmail(o: EsimOrder, l: EsimLine, locale: "ar" | "en") {
  const ar = locale === "ar";
  const size = o.plan.dataGB === null ? (ar ? "غير محدودة" : "unlimited") : `${o.plan.dataGB} GB`;
  const number = l.phoneNumber ? (ar ? `\nرقمك السعودي: ${l.phoneNumber}` : `\nYour Saudi number: ${l.phoneNumber}`) : "";
  return ar
    ? {
        subject: `شريحتك الإلكترونية (eSIM) للسعودية — ${o.reference}`,
        text: `مرحبًا ${l.name}،\n\nهذه شريحتك الإلكترونية: ${size} لمدة ${o.plan.days} يومًا${o.plan.minutes ? ` و${o.plan.minutes} دقيقة محلية` : ""}.${number}\n\nالتثبيت (قبل السفر، مع اتصال بالإنترنت):\n1. الإعدادات ← الشبكة الخلوية / الاتصالات ← إضافة eSIM.\n2. امسح رمز QR من «حجوزاتي» في سعودي تريب، أو أدخل البيانات يدويًا:\n   عنوان SM-DP+: ${l.smdpAddress}\n   رمز التفعيل: ${l.matchingId}\n3. فعّل تجوال البيانات للشريحة الجديدة عند الوصول.\n\nيجب أن يدعم جهازك eSIM وأن يكون غير مقفل على شبكة معينة.\nرقم الشريحة (ICCID): ${l.iccid}`,
      }
    : {
        subject: `Your Saudi eSIM — ${o.reference}`,
        text: `Hello ${l.name},\n\nHere is your eSIM: ${size} for ${o.plan.days} days${o.plan.minutes ? ` with ${o.plan.minutes} local minutes` : ""}.${number}\n\nInstallation (before you travel, while online):\n1. Settings → Mobile / Cellular → Add eSIM.\n2. Scan the QR code from “My bookings” on Saudi Trip, or enter the details manually:\n   SM-DP+ address: ${l.smdpAddress}\n   Activation code: ${l.matchingId}\n3. Turn on data roaming for the new line when you arrive.\n\nYour phone must support eSIM and be carrier-unlocked.\nICCID: ${l.iccid}`,
      };
}
