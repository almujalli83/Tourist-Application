/**
 * Payment intents: the browser authorizes the amount first (card with 3-D Secure, a saved card,
 * Apple Pay, Google Pay or STC Pay), then sends the intent id with its order. The order's service
 * settles it (captured once, for exactly the order's amount) or it is voided. Card numbers are
 * never stored: saved cards keep the gateway's token, brand, last 4 digits and expiry.
 */
import { randomUUID } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { store } from "../store";
import { gateway, GatewayError } from "./gateway";
import { PAY_METHODS, type IntentStatus, type IntentView, type PayMethod, type PaySource, type SavedCard } from "./types";

export class PayError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

interface Intent {
  id: string;
  userId: string;
  amountSAR: number;
  description: string;
  method: PayMethod;
  status: IntentStatus;
  brand: string;
  last4: string;
  ref: string;
  actionUrl: string | null;
  otp: boolean;
  error: string | null;
  sandbox: boolean;
  save: boolean;
  exp: { month: string; year: string } | null;
  usedAt: string | null;
  /** Captured so far: one checkout can pay several orders (a package and its plan's tickets and tables). */
  capturedSAR: number;
  refundedSAR: number;
  createdAt: string;
  updatedAt: string;
}
type StoredCard = SavedCard & { userId: string; token: string };

/** Authorized intents not used by an order within this time are voided. */
export const INTENT_TTL_MIN = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function viewOf(i: Intent): IntentView {
  return {
    id: i.id, amountSAR: i.amountSAR, status: i.status, method: i.method, brand: i.brand, last4: i.last4,
    action: i.status === "requires_action" ? (i.otp ? { type: "otp" } : i.actionUrl ? { type: "3ds", url: i.actionUrl } : null) : null,
    error: i.error, sandbox: i.sandbox,
  };
}

const methodOf = (s: PaySource): PayMethod => (s.type === "applepay" || s.type === "googlepay" || s.type === "stcpay" ? s.type : "card");

export async function createIntent(user: PublicUser, input: { amountSAR?: number; description?: string; source?: PaySource; save?: boolean; returnUrl?: string }, now = new Date()): Promise<IntentView> {
  const amount = round2(Number(input.amountSAR));
  if (!(amount > 0 && amount <= 1_000_000)) throw new PayError("invalid_amount");
  const src = input.source;
  if (!src || typeof src !== "object" || !["card", "token", "saved", "applepay", "googlepay", "stcpay"].includes(src.type)) throw new PayError("invalid_card");
  let savedToken: string | undefined;
  let savedCard: StoredCard | null = null;
  if (src.type === "saved") {
    savedCard = await store().get<StoredCard>("savedCards", String(src.cardId));
    if (!savedCard || savedCard.userId !== user.id) throw new PayError("invalid_card");
    savedToken = savedCard.token;
  }
  const g = gateway();
  const id = randomUUID();
  const save = input.save === true && (src.type === "card" || src.type === "token");
  let p;
  try {
    p = await g.create({ amountSAR: amount, description: String(input.description ?? "Saudi Trip").slice(0, 120), source: { ...src, savedToken }, callbackUrl: String(input.returnUrl ?? ""), intentId: id, save });
  } catch (e) {
    throw new PayError(e instanceof GatewayError ? (e.code === "unavailable" ? "gateway_unavailable" : e.code) : "gateway_unavailable", e instanceof GatewayError && e.code === "unavailable" ? 502 : 402);
  }
  const at = now.toISOString();
  const doc: Intent = {
    id, userId: user.id, amountSAR: amount, description: String(input.description ?? "").slice(0, 120), method: methodOf(src),
    status: p.status === "failed" ? "failed" : p.status, brand: savedCard?.brand ?? p.brand, last4: savedCard?.last4 || p.last4, ref: p.ref,
    actionUrl: p.actionUrl, otp: src.type === "stcpay" && p.status === "requires_action", error: p.error, sandbox: g.sandbox, save,
    exp: src.type === "card" ? { month: src.expMonth, year: src.expYear } : null, usedAt: null, capturedSAR: 0, refundedSAR: 0, createdAt: at, updatedAt: at,
  };
  await store().put("paymentIntents", id, doc);
  if (doc.status === "authorized" && p.cardToken) await saveCard(doc, p.cardToken, now);
  if (doc.status === "failed") throw new PayError(p.error ?? "declined", 402);
  return viewOf(doc);
}

async function saveCard(i: Intent, token: string, now: Date) {
  if (!i.save || !token) return;
  const mine = await store().findBy<StoredCard>("savedCards", "userId", i.userId);
  if (mine.some((c) => c.last4 === i.last4 && c.brand === i.brand && c.expMonth === i.exp?.month && c.expYear === i.exp?.year)) return;
  const c: StoredCard = { id: randomUUID(), userId: i.userId, token, brand: i.brand, last4: i.last4, expMonth: i.exp?.month ?? "", expYear: i.exp?.year ?? "", createdAt: now.toISOString() };
  await store().put("savedCards", c.id, c);
}

async function own(userId: string, id: string): Promise<Intent> {
  const i = await store().get<Intent>("paymentIntents", id);
  if (!i || i.userId !== userId) throw new PayError("not_found", 404);
  return i;
}

/** The intent's current state (after 3-D Secure the gateway is asked again). */
export async function getIntent(userId: string, id: string, now = new Date()): Promise<IntentView> {
  let i = await own(userId, id);
  if (i.status === "requires_action" && !i.sandbox) {
    try {
      const p = await gateway().fetch(i.ref);
      if (p.status !== "requires_action") {
        i = (await store().update<Intent>("paymentIntents", id, (x) => ({ ...x, status: p.status === "authorized" ? "authorized" : "failed", error: p.error, updatedAt: now.toISOString() })))!;
        if (i.status === "authorized" && p.cardToken) await saveCard(i, p.cardToken, now);
      }
    } catch {
      /* the gateway is asked again next time */
    }
  }
  return viewOf(i);
}

/** STC Pay: the one-time code sent to the traveller's mobile. */
export async function submitOtp(userId: string, id: string, otp: string, now = new Date()): Promise<IntentView> {
  const i = await own(userId, id);
  if (i.status !== "requires_action" || !i.otp) throw new PayError("not_pending", 409);
  try {
    const p = await gateway().otp(i.ref, String(otp ?? "").trim());
    return viewOf((await store().update<Intent>("paymentIntents", id, (x) => ({ ...x, status: p.status === "authorized" ? "authorized" : "failed", otp: false, updatedAt: now.toISOString() })))!);
  } catch (e) {
    throw new PayError(e instanceof GatewayError && e.code === "invalid_otp" ? "invalid_otp" : "gateway_unavailable", e instanceof GatewayError && e.code === "invalid_otp" ? 400 : 502);
  }
}

/** Sandbox bank page: the traveller approves or fails 3-D Secure. */
export async function sandboxThreeDs(userId: string, id: string, approve: boolean, now = new Date()): Promise<IntentView> {
  const i = await own(userId, id);
  if (!i.sandbox || i.status !== "requires_action" || i.otp) throw new PayError("not_pending", 409);
  const out = (await store().update<Intent>("paymentIntents", id, (x) => ({ ...x, status: approve ? "authorized" : "failed", error: approve ? null : "3ds_failed", updatedAt: now.toISOString() })))!;
  if (approve && out.save) await saveCard(out, `tok_sbx_${randomUUID()}`, now);
  return viewOf(out);
}

/** Releases an authorization that no order used (the order failed, or the traveller left). */
export async function voidIntent(userId: string, id: string, now = new Date()): Promise<IntentView> {
  const i = await own(userId, id);
  if (i.status !== "authorized" && i.status !== "requires_action") return viewOf(i);
  if (i.capturedSAR > 0) throw new PayError("already_used", 409);
  await gateway().void(i.ref).catch(() => undefined);
  return viewOf((await store().update<Intent>("paymentIntents", id, (x) => ({ ...x, status: "voided", updatedAt: now.toISOString() })))!);
}

export type SettleResult = { ok: true; transactionId: string; method: string; last4: string } | { ok: false; code: "invalid_card" | "declined" };

/**
 * Captures an authorized intent for an order, up to the authorized amount: the checkout's total may
 * pay several orders together (a package, then its plan's tickets and tables). Never more.
 */
export async function settleIntent(id: string, amountSAR: number, now = new Date()): Promise<SettleResult> {
  const amount = round2(amountSAR);
  const i = await store().get<Intent>("paymentIntents", String(id ?? ""));
  if (!i) return { ok: false, code: "invalid_card" };
  if (!(amount > 0) || i.status !== "authorized") return { ok: false, code: "declined" };
  let claimed = false;
  await store().update<Intent>("paymentIntents", id, (x) => {
    if (x.status !== "authorized" || round2(x.capturedSAR + amount) > x.amountSAR + 0.009) return x;
    claimed = true;
    const captured = round2(x.capturedSAR + amount);
    return { ...x, capturedSAR: captured, usedAt: x.usedAt ?? now.toISOString(), status: captured >= x.amountSAR - 0.009 ? "captured" : "authorized", updatedAt: now.toISOString() };
  });
  if (!claimed) return { ok: false, code: "declined" };
  try {
    await gateway().capture(i.ref, amount);
  } catch {
    await store().update<Intent>("paymentIntents", id, (x) => ({ ...x, capturedSAR: round2(x.capturedSAR - amount), status: "authorized" }));
    return { ok: false, code: "declined" };
  }
  return { ok: true, transactionId: `pi_${i.id}`, method: i.method === "card" ? i.brand : i.method, last4: i.last4 };
}

/** Refunds a captured intent (partly or fully) through the gateway; null when the transaction isn't an intent. */
export async function refundIntent(transactionId: string, amountSAR: number, now = new Date()): Promise<{ refundId: string } | null> {
  if (!transactionId.startsWith("pi_")) return null;
  const id = transactionId.slice(3);
  const i = await store().get<Intent>("paymentIntents", id);
  if (!i) return null;
  const amount = round2(Math.min(amountSAR, i.capturedSAR - i.refundedSAR));
  if (!(amount > 0)) throw new PayError("invalid_amount");
  const r = await gateway().refund(i.ref, amount);
  await store().update<Intent>("paymentIntents", id, (x) => {
    const refunded = round2(x.refundedSAR + amount);
    return { ...x, refundedSAR: refunded, status: refunded >= x.capturedSAR - 0.009 ? "refunded" : "partially_refunded", updatedAt: now.toISOString() };
  });
  return r;
}

export async function listSavedCards(userId: string): Promise<SavedCard[]> {
  return (await store().findBy<StoredCard>("savedCards", "userId", userId))
    .map(({ userId: _u, token: _t, ...c }) => c) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteSavedCard(userId: string, id: string): Promise<boolean> {
  const c = await store().get<StoredCard>("savedCards", id);
  if (!c || c.userId !== userId) return false;
  return store().delete("savedCards", id);
}

/** Daily: authorizations no order used are released. */
export async function voidStaleIntents(now = new Date()): Promise<number> {
  let n = 0;
  for (const i of await store().list<Intent>("paymentIntents", 100_000)) {
    if ((i.status === "authorized" || i.status === "requires_action") && now.getTime() - Date.parse(i.createdAt) > INTENT_TTL_MIN * 60_000) {
      // Nothing used: released; partly used (an order of the checkout failed): the rest is released.
      await gateway().void(i.ref).catch(() => undefined);
      await store().update<Intent>("paymentIntents", i.id, (x) => ({ ...x, status: x.capturedSAR > 0 ? "captured" : "voided", updatedAt: now.toISOString() }));
      n++;
    }
  }
  return n;
}

/** A receipt of an intent (for the receipt PDF). */
export async function intentForReceipt(userId: string, id: string) {
  const i = await own(userId, id);
  return { id: i.id, amountSAR: i.amountSAR, description: i.description, method: i.method, brand: i.brand, last4: i.last4, status: i.status, refundedSAR: i.refundedSAR, createdAt: i.createdAt };
}

export { PAY_METHODS };
