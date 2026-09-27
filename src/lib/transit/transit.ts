/**
 * Public transport inside the platform: journey planning and live arrivals from the operator,
 * tickets bought here (paid by card, codes issued by the operator and shown as a QR at the gates),
 * activated when the traveller starts riding, and transit-card top-ups.
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { store } from "../store";
import { transitCities, TransitProviderError, transitProvider, type TransitLine, type TransitProvider, type TransitStop } from "./provider";
import { TOPUP_AMOUNTS, type Arrival, type Journey, type TopUp, type TransitPlace, type TransitProduct, type TransitTicket } from "./types";

export class TransitError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

type StoredTicket = TransitTicket & { userId: string };
type StoredTopUp = TopUp & { userId: string; city: string; payment: { transactionId: string; method: string; last4: string } };
interface TransitOrder {
  id: string; reference: string; userId: string; city: string; productId: string; qty: number; totalSAR: number; providerRef: string;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string }; createdAt: string;
}

const toLocal = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);
export const MAX_TICKETS = 10;

function operator(city: string): TransitProvider {
  const p = transitProvider(String(city ?? "").toUpperCase());
  if (!p) throw new TransitError("noOperator", 404);
  return p;
}

const validPlace = (p: Partial<TransitPlace> | undefined): TransitPlace => {
  const lat = Number(p?.lat);
  const lng = Number(p?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new TransitError("invalidPlace");
  const name = String(p?.name ?? "").trim().slice(0, 120) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  return { name, nameAr: String(p?.nameAr ?? "").trim().slice(0, 120) || name, lat, lng };
};

/** Journeys (metro and buses) from the operator's planner. */
export async function planJourneys(city: string, input: { from?: Partial<TransitPlace>; to?: Partial<TransitPlace>; departAt?: string }, now = new Date()): Promise<Journey[]> {
  const from = validPlace(input.from);
  const to = validPlace(input.to);
  const departAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(input.departAt)) ? input.departAt! : toLocal(now.getTime());
  try {
    return await operator(city).plan(from, to, departAt);
  } catch (e) {
    if (e instanceof TransitError) throw e;
    throw new TransitError("operatorUnavailable", 502);
  }
}

export async function liveArrivals(city: string, at: { lat?: unknown; lng?: unknown }, now = new Date()): Promise<Arrival[]> {
  const p = validPlace({ lat: Number(at.lat), lng: Number(at.lng) });
  try {
    return await operator(city).arrivals(p, now);
  } catch (e) {
    if (e instanceof TransitError) throw e;
    throw new TransitError("operatorUnavailable", 502);
  }
}

export interface OperatorInfo { city: string; nameAr: string; nameEn: string; sandbox: boolean; metro: boolean; topUp: boolean }
const info = (p: TransitProvider): OperatorInfo => ({ city: p.city, nameAr: p.nameAr, nameEn: p.nameEn, sandbox: p.sandbox, ...p.features });

/** Cities with public transport in the platform. */
export const transitOperators = (): OperatorInfo[] => transitCities().map((c) => transitProvider(c)).filter((p): p is TransitProvider => !!p).map(info);

export async function transitStops(city: string): Promise<TransitStop[]> {
  try {
    return await operator(city).stops();
  } catch (e) {
    if (e instanceof TransitError) throw e;
    throw new TransitError("operatorUnavailable", 502);
  }
}

export async function transitLines(city: string): Promise<TransitLine[]> {
  try {
    return (await operator(city).lines()) ?? [];
  } catch (e) {
    if (e instanceof TransitError) throw e;
    return [];
  }
}

export async function listProducts(city: string): Promise<{ products: TransitProduct[]; operator: OperatorInfo }> {
  const p = operator(city);
  try {
    return { products: await p.products(), operator: info(p) };
  } catch {
    throw new TransitError("operatorUnavailable", 502);
  }
}

/** Buys tickets: the price comes from the operator (checked against what the traveller saw), the card is charged, then the operator issues the codes. */
export async function buyTickets(user: PublicUser, input: { city?: string; productId?: string; qty?: number; expectedTotalSAR?: number; card?: CardInput }, now = new Date()): Promise<TransitTicket[]> {
  const city = String(input.city ?? "").toUpperCase();
  const p = operator(city);
  const qty = Math.round(Number(input.qty));
  if (!(qty >= 1 && qty <= MAX_TICKETS)) throw new TransitError("invalidQty");
  let product: TransitProduct | undefined;
  try {
    product = (await p.products()).find((x) => x.id === input.productId);
  } catch {
    throw new TransitError("operatorUnavailable", 502);
  }
  if (!product) throw new TransitError("productNotFound", 404);
  const total = Math.round(product.priceSAR * qty * 100) / 100;
  if (Math.abs(total - Number(input.expectedTotalSAR)) > 0.01) throw new TransitError("priceChanged", 409);
  if (!input.card) throw new TransitError("invalid_card");
  const paid = await chargeCard(input.card, total, now);
  if (!paid.ok) throw new TransitError(paid.code, 402);
  const reference = `TT-${randomBytes(3).toString("hex").toUpperCase()}`;
  let issued;
  try {
    issued = await p.buy({ productId: product.id, qty, reference, email: user.email });
  } catch (e) {
    await refundPayment(paid.transactionId, total);
    throw new TransitError(e instanceof TransitProviderError && e.code === "rejected" ? "operatorRejected" : "operatorUnavailable", 502);
  }
  const at = now.toISOString();
  const order: TransitOrder = {
    id: randomBytes(10).toString("hex"), reference, userId: user.id, city, productId: product.id, qty, totalSAR: total, providerRef: issued.ref,
    payment: { transactionId: paid.transactionId, method: paid.method, last4: paid.last4, amountSAR: total, paidAt: at }, createdAt: at,
  };
  await store().put("transitOrders", order.id, order);
  const tickets: StoredTicket[] = issued.codes.map((code, i) => ({
    id: randomBytes(10).toString("hex"), reference: `${reference}-${i + 1}`, userId: user.id, city, productId: product!.id, nameAr: product!.nameAr, nameEn: product!.nameEn,
    cls: product!.cls, validityMins: product!.validityMins, priceSAR: product!.priceSAR, status: "unused", code, activatedAt: null, validUntil: null, orderId: order.id, createdAt: at,
    ...(p.sandbox ? { sandbox: true } : {}),
  }));
  for (const t of tickets) await store().put("transitTickets", t.id, t);
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — ${product.nameEn} × ${qty} / ${product.nameAr} × ${qty}`,
    text: [`${product.nameEn} × ${qty} — SAR ${total} (${reference})`, "Activate a ticket in My bookings when you start riding and show its QR code at the gate.", "", `${product.nameAr} × ${qty} — ${total} ر.س (${reference})`, "فعّل التذكرة من «حجوزاتي» عند بدء الرحلة واعرض رمز QR عند البوابة."].join("\n"),
  }).catch(() => undefined);
  return tickets.map(strip);
}

const strip = ({ userId: _u, ...t }: StoredTicket): TransitTicket => t; // eslint-disable-line @typescript-eslint/no-unused-vars
const withStatus = (t: StoredTicket, now: Date): StoredTicket => (t.status === "active" && t.validUntil && Date.parse(t.validUntil) <= now.getTime() ? { ...t, status: "expired" } : t);

export async function listTickets(userId: string, now = new Date()): Promise<TransitTicket[]> {
  const rows = (await store().findBy<StoredTicket>("transitTickets", "userId", userId)).map((t) => withStatus(t, now));
  return rows.map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTicket(userId: string, id: string, now = new Date()): Promise<TransitTicket | null> {
  const t = await store().get<StoredTicket>("transitTickets", id);
  return t && t.userId === userId ? strip(withStatus(t, now)) : null;
}

/** Starts the ticket's validity with the operator (when the traveller starts riding). */
export async function activateTicket(userId: string, id: string, now = new Date()): Promise<TransitTicket> {
  const t = await store().get<StoredTicket>("transitTickets", id);
  if (!t || t.userId !== userId) throw new TransitError("notFound", 404);
  if (t.status !== "unused") throw new TransitError("alreadyActivated", 409);
  let r;
  try {
    r = await operator(t.city).activate(t.code, now, t.validityMins);
  } catch (e) {
    if (e instanceof TransitError) throw e;
    throw new TransitError("operatorUnavailable", 502);
  }
  return strip((await store().update<StoredTicket>("transitTickets", id, (x) => ({ ...x, status: "active", activatedAt: r.activatedAt, validUntil: r.validUntil })))!);
}

/** Tops up the traveller's transit card (paid by card here, credited by the operator). */
export async function topUpCard(user: PublicUser, input: { city?: string; cardNo?: string; amountSAR?: number; card?: CardInput }, now = new Date()): Promise<TopUp> {
  const city = String(input.city ?? "").toUpperCase();
  const p = operator(city);
  if (!p.features.topUp) throw new TransitError("noTopUp", 409);
  const cardNo = String(input.cardNo ?? "").replace(/\s/g, "");
  if (!/^\d{8,20}$/.test(cardNo)) throw new TransitError("invalidCardNo");
  const amount = Number(input.amountSAR);
  if (!(TOPUP_AMOUNTS as readonly number[]).includes(amount)) throw new TransitError("invalidAmount");
  if (!input.card) throw new TransitError("invalid_card");
  const paid = await chargeCard(input.card, amount, now);
  if (!paid.ok) throw new TransitError(paid.code, 402);
  const reference = `TU-${randomBytes(3).toString("hex").toUpperCase()}`;
  let r;
  try {
    r = await p.topUp(cardNo, amount, reference);
  } catch (e) {
    await refundPayment(paid.transactionId, amount);
    throw new TransitError(e instanceof TransitProviderError && e.code === "rejected" ? "cardRejected" : "operatorUnavailable", 502);
  }
  const doc: StoredTopUp = {
    id: randomBytes(10).toString("hex"), reference, userId: user.id, city, cardNo: `••••${cardNo.slice(-4)}`, amountSAR: amount, balanceSAR: r.balanceSAR, createdAt: now.toISOString(),
    payment: { transactionId: paid.transactionId, method: paid.method, last4: paid.last4 }, ...(p.sandbox ? { sandbox: true } : {}),
  };
  await store().put("transitTopups", doc.id, doc);
  const { userId: _u, city: _c, payment: _p, ...pub } = doc; // eslint-disable-line @typescript-eslint/no-unused-vars
  return pub;
}

export async function listTopUps(userId: string): Promise<TopUp[]> {
  return (await store().findBy<StoredTopUp>("transitTopups", "userId", userId))
    .map(({ userId: _u, city: _c, payment: _p, ...t }) => t) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
