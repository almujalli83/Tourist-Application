/**
 * Event ticket orders: bought separately from packages by any signed-in account. Seats and
 * general-admission tickets are reserved atomically per session before the card is charged;
 * tickets are issued in the buyer's name, saved in the wallet and emailed. Cancellation follows
 * the event's refund policy.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { displayName, type PublicUser } from "../auth/types";
import { todayISO } from "../dates";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { store } from "../store";
import { isKnownSeat, listCatalog, providerCancel, providerPurchase, providerSoldCount, providerSoldSeat } from "./catalog";
import { listSeasons } from "./seasons";
import type { EventItem, EventOrder, EventSession, OrderLine } from "./types";

/** Online sales close this long before a session starts. */
export const SALES_CLOSE_HOURS = 2;

export async function eventsCatalog(): Promise<EventItem[]> {
  return listCatalog(await listSeasons(true), todayISO());
}

export async function getEvent(id: string): Promise<EventItem | null> {
  return (await eventsCatalog()).find((e) => e.id === id) ?? null;
}

/** Sessions still on sale. */
export function openSessions(e: EventItem, now = new Date()): EventSession[] {
  const limit = now.getTime() + SALES_CLOSE_HOURS * 3_600_000;
  return e.sessions.filter((s) => Date.parse(s.start) > limit);
}

export function minPriceSAR(e: EventItem): number {
  const prices = e.seating === "seated" ? (e.sections ?? []).map((s) => s.priceSAR) : (e.ticketTypes ?? []).map((t) => t.priceSAR);
  return Math.min(...prices);
}

/* -------------------------------------------------------- availability */

interface SessionSeats {
  id: string;
  /** Seat id → order id. */
  taken: Record<string, string>;
  /** Ticket type id → tickets sold here. */
  sold: Record<string, number>;
}

async function sessionDoc(sessionId: string): Promise<SessionSeats> {
  const s = store();
  const doc = await s.get<SessionSeats>("eventSeats", sessionId);
  if (doc) return doc;
  const fresh: SessionSeats = { id: sessionId, taken: {}, sold: {} };
  await s.insert("eventSeats", sessionId, fresh);
  return (await s.get<SessionSeats>("eventSeats", sessionId)) ?? fresh;
}

export interface Availability {
  /** Unavailable seats (seated events). */
  unavailable: string[];
  /** Remaining tickets per type (general admission). */
  remaining: Record<string, number>;
}

export async function availability(e: EventItem, sessionId: string): Promise<Availability> {
  const doc = await sessionDoc(sessionId);
  const unavailable: string[] = [];
  for (const sec of e.sections ?? []) {
    for (let r = 0; r < sec.rows; r++) {
      for (let n = 1; n <= sec.seatsPerRow; n++) {
        const id = `${sec.id}-${String.fromCharCode(65 + r)}${n}`;
        if (doc.taken[id] || providerSoldSeat(sessionId, id)) unavailable.push(id);
      }
    }
  }
  const remaining: Record<string, number> = {};
  for (const t of e.ticketTypes ?? []) remaining[t.id] = Math.max(0, t.capacity - providerSoldCount(sessionId, t) - (doc.sold[t.id] ?? 0));
  return { unavailable, remaining };
}

/** Reserves the seats / tickets for the order; returns false when any is no longer available. */
async function reserve(e: EventItem, sessionId: string, lines: OrderLine[], orderId: string): Promise<boolean> {
  await sessionDoc(sessionId);
  let ok = true;
  await store().update<SessionSeats>("eventSeats", sessionId, (doc) => {
    const seats = lines.filter((l) => l.seat).map((l) => l.seat!);
    if (seats.some((seat) => doc.taken[seat] || providerSoldSeat(sessionId, seat))) {
      ok = false;
      return doc;
    }
    const counts: Record<string, number> = {};
    for (const l of lines) if (l.kind === "general") counts[l.typeId] = (counts[l.typeId] ?? 0) + 1;
    for (const [typeId, n] of Object.entries(counts)) {
      const t = e.ticketTypes!.find((x) => x.id === typeId)!;
      if (providerSoldCount(sessionId, t) + (doc.sold[typeId] ?? 0) + n > t.capacity) {
        ok = false;
        return doc;
      }
    }
    const taken = { ...doc.taken };
    for (const seat of seats) taken[seat] = orderId;
    const sold = { ...doc.sold };
    for (const [typeId, n] of Object.entries(counts)) sold[typeId] = (sold[typeId] ?? 0) + n;
    return { ...doc, taken, sold };
  });
  return ok;
}

async function release(sessionId: string, lines: OrderLine[], orderId: string) {
  await store().update<SessionSeats>("eventSeats", sessionId, (doc) => {
    const taken = { ...doc.taken };
    for (const l of lines) if (l.seat && taken[l.seat] === orderId) delete taken[l.seat];
    const sold = { ...doc.sold };
    for (const l of lines) if (l.kind === "general") sold[l.typeId] = Math.max(0, (sold[l.typeId] ?? 0) - 1);
    return { ...doc, taken, sold };
  });
}

/* -------------------------------------------------------- purchase */

export class EventOrderError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

export interface OrderInput {
  eventId: string;
  sessionId: string;
  seats?: string[];
  quantities?: Record<string, number>;
  expectedTotalSAR: number;
  idempotencyKey: string;
  displayCurrency?: string;
  card: CardInput;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const orderIdFor = (userId: string, key: string) => createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 24);

/** The order lines requested (validated against the event); no availability check. */
export function buildLines(e: EventItem, seats: string[] = [], quantities: Record<string, number> = {}): OrderLine[] {
  const lines: OrderLine[] = [];
  if (e.seating === "seated") {
    if (Object.values(quantities).some((q) => q > 0)) throw new EventOrderError("invalidTickets");
    for (const seat of new Set(seats)) {
      const sec = isKnownSeat(e, seat);
      if (!sec) throw new EventOrderError("invalidTickets");
      lines.push({ kind: "seat", typeId: sec.id, typeNameAr: sec.nameAr, typeNameEn: sec.nameEn, seat, priceSAR: sec.priceSAR });
    }
  } else {
    if (seats.length) throw new EventOrderError("invalidTickets");
    for (const [typeId, q] of Object.entries(quantities)) {
      const t = e.ticketTypes?.find((x) => x.id === typeId);
      if (!t || !Number.isInteger(q) || q < 0) throw new EventOrderError("invalidTickets");
      for (let i = 0; i < q; i++) lines.push({ kind: "general", typeId, typeNameAr: t.nameAr, typeNameEn: t.nameEn, seat: null, priceSAR: t.priceSAR });
    }
  }
  if (!lines.length) throw new EventOrderError("noTickets");
  if (lines.length > e.maxPerOrder) throw new EventOrderError("tooManyTickets");
  return lines;
}

export async function placeOrder(user: PublicUser, input: OrderInput, now = new Date()): Promise<EventOrder> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new EventOrderError("idempotencyKey", 400);
  const id = orderIdFor(user.id, input.idempotencyKey);
  const existing = await store().get<EventOrder>("eventOrders", id);
  if (existing) return existing;

  const e = await getEvent(input.eventId);
  if (!e) throw new EventOrderError("notFound", 404);
  const session = openSessions(e, now).find((s) => s.id === input.sessionId);
  if (!session) throw new EventOrderError("sessionClosed");
  const lines = buildLines(e, input.seats, input.quantities);
  const totalSAR = round2(lines.reduce((a, l) => a + l.priceSAR, 0));
  if (Math.abs(totalSAR - Number(input.expectedTotalSAR)) > 0.01) throw new EventOrderError("priceChanged", 409);

  if (!(await reserve(e, session.id, lines, id))) throw new EventOrderError(e.seating === "seated" ? "seatUnavailable" : "soldOut", 409);
  const pay = await chargeCard(input.card, totalSAR, now);
  if (!pay.ok) {
    await release(session.id, lines, id);
    throw new EventOrderError(`payment_${pay.code}`, 402);
  }
  const issued = await providerPurchase(e, lines.length);
  const order: EventOrder = {
    id,
    reference: `EV-${randomBytes(4).toString("hex").toUpperCase()}`,
    userId: user.id,
    idempotencyKey: input.idempotencyKey,
    createdAt: now.toISOString(),
    status: "CONFIRMED",
    provider: e.provider,
    providerRef: issued.providerRef,
    event: { id: e.id, titleAr: e.titleAr, titleEn: e.titleEn, venueAr: e.venueAr, venueEn: e.venueEn, city: e.city, category: e.category, lat: e.lat, lng: e.lng, durationMins: e.durationMins, seasonId: e.seasonId, refund: e.refund },
    session,
    tickets: lines.map((line, i) => ({ id: randomUUID(), code: issued.codes[i], line })),
    totalSAR,
    displayCurrency: input.displayCurrency ?? "SAR",
    payment: { transactionId: pay.transactionId, method: pay.method, last4: pay.last4, amountSAR: totalSAR, paidAt: now.toISOString() },
    holderName: displayName(user),
    holderEmail: user.email,
    cancellation: null,
  };
  if (!(await store().insert("eventOrders", id, order))) {
    // Same request submitted twice at once: keep the first order, undo this one.
    await refundPayment(pay.transactionId, totalSAR);
    return (await store().get<EventOrder>("eventOrders", id))!;
  }
  await notifyTravellers([user.email], orderEmail(order, "confirmed", user.preferredLocale));
  return order;
}

/* -------------------------------------------------------- orders */

export async function listOrders(userId: string): Promise<EventOrder[]> {
  const rows = await store().findBy<EventOrder>("eventOrders", "userId", userId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOrder(userId: string, id: string): Promise<EventOrder | null> {
  const o = await store().get<EventOrder>("eventOrders", id);
  return o && o.userId === userId ? o : null;
}

/** Last moment the order can be cancelled, or null when the tickets are final. */
export function cancellationDeadline(o: Pick<EventOrder, "event" | "session">): string | null {
  if (!o.event.refund.refundable) return null;
  return new Date(Date.parse(o.session.start) - o.event.refund.cutoffHours * 3_600_000).toISOString();
}

export function canCancel(o: EventOrder, now = new Date()): boolean {
  const deadline = cancellationDeadline(o);
  return o.status === "CONFIRMED" && !!deadline && now.getTime() < Date.parse(deadline);
}

export async function cancelOrder(user: PublicUser, id: string, now = new Date()): Promise<EventOrder> {
  const o = await getOrder(user.id, id);
  if (!o) throw new EventOrderError("notFound", 404);
  if (!canCancel(o, now)) throw new EventOrderError("notCancellable");
  let claimed = false;
  await store().update<EventOrder>("eventOrders", id, (cur) => {
    if (cur.status !== "CONFIRMED" || cur.cancellation) return cur;
    claimed = true;
    return { ...cur, status: "CANCELLED", cancellation: { at: now.toISOString(), refundSAR: 0, refundId: "" } };
  });
  if (!claimed) throw new EventOrderError("notCancellable");
  const refund = await refundPayment(o.payment.transactionId, o.totalSAR);
  await providerCancel(o.providerRef);
  await release(o.session.id, o.tickets.map((t) => t.line), o.id);
  const done = await store().update<EventOrder>("eventOrders", id, (cur) => ({
    ...cur,
    cancellation: { at: now.toISOString(), refundSAR: refund.ok ? o.totalSAR : 0, refundId: refund.ok ? refund.refundId : "" },
  }));
  await notifyTravellers([o.holderEmail], orderEmail(done!, "cancelled", user.preferredLocale));
  return done!;
}

/* -------------------------------------------------------- email */

const ksaTime = (iso: string, ar: boolean) =>
  new Date(iso).toLocaleString(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "full", timeStyle: "short" });

function orderEmail(o: EventOrder, kind: "confirmed" | "cancelled", locale: "ar" | "en") {
  const ar = locale === "ar";
  const title = ar ? o.event.titleAr : o.event.titleEn;
  const when = ksaTime(o.session.start, ar);
  const lines = o.tickets.map((t) => `- ${ar ? t.line.typeNameAr : t.line.typeNameEn}${t.line.seat ? ` · ${t.line.seat}` : ""} · ${t.code}`).join("\n");
  if (kind === "confirmed") {
    return ar
      ? { subject: `تذاكرك: ${title} — ${o.reference}`, text: `تم تأكيد طلبك ${o.reference}.\n\n${title}\n${ar ? o.event.venueAr : o.event.venueEn}\n${when}\n\nالتذاكر:\n${lines}\n\nالمبلغ: ${o.totalSAR} ريال\nالتذاكر محفوظة في محفظتك الرقمية في سعودي تريب.` }
      : { subject: `Your tickets: ${title} — ${o.reference}`, text: `Your order ${o.reference} is confirmed.\n\n${title}\n${o.event.venueEn}\n${when}\n\nTickets:\n${lines}\n\nAmount: SAR ${o.totalSAR}\nYour tickets are saved in your Saudi Trip digital wallet.` };
  }
  const refund = o.cancellation?.refundSAR ?? 0;
  return ar
    ? { subject: `إلغاء الطلب ${o.reference}`, text: `تم إلغاء طلبك ${o.reference} (${title} — ${when}).\nسيُعاد ${refund} ريال إلى البطاقة المستخدمة في الدفع.` }
    : { subject: `Order ${o.reference} cancelled`, text: `Your order ${o.reference} (${title} — ${when}) has been cancelled.\nSAR ${refund} will be refunded to the card used for payment.` };
}
