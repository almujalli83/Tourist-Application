/**
 * Train ticket orders (bought separately from packages). Each ticket is in a passenger's name
 * with their passport; one-way or return in one order; seats chosen on the coach map and held
 * atomically per train run before the card is charged. Cancellation follows SAR's policy.
 * Passport numbers go to SAR only; orders keep them masked.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { COUNTRIES } from "../data/countries";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { listBookingsByUser } from "../repo";
import { getSavedTraveller, listWithKeys, passportKey } from "../saved-travellers-repo";
import { store } from "../store";
import { lineById, stationByCode } from "./network";
import { allSeats, refundShare, sarCancel, sarIssue, sarSoldSeat, seatInfo, tripById, type PassengerType, type TrainClass, type TrainTrip } from "./sar";

export const SALES_CLOSE_MINUTES = 30;
export const MAX_PASSENGERS = 9;
/** Cancellation is possible until this long before the first departure. */
export const CANCEL_CLOSE_HOURS = 1;

export interface OrderLeg {
  kind: "outbound" | "return";
  trip: TrainTrip;
  cls: TrainClass;
}

export interface OrderPassenger {
  nameEn: string;
  nationality: string;
  passportMasked: string;
  type: PassengerType;
}

export interface TrainTicket {
  id: string;
  code: string;
  leg: number;
  passenger: number;
  seat: string;
  priceSAR: number;
}

export interface TrainOrder {
  id: string;
  reference: string;
  pnr: string;
  userId: string;
  idempotencyKey: string;
  createdAt: string;
  status: "CONFIRMED" | "CANCELLED";
  legs: OrderLeg[];
  passengers: OrderPassenger[];
  tickets: TrainTicket[];
  totalSAR: number;
  displayCurrency: string;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string };
  buyerEmail: string;
  cancellation: { at: string; refundSAR: number; feeSAR: number; refundId: string } | null;
}

export class TrainOrderError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

/* ---------------------------------------------------------- passengers */

export interface PassengerOption {
  ref: string;
  nameEn: string;
  nationality: string;
  passportMasked: string;
  birthDate: string | null;
}

const mask = (pn: string) => (pn.length > 4 ? `•••${pn.slice(-4)}` : pn);

/** People the buyer can pick: saved travellers, then travellers of their bookings. */
export async function passengerOptions(userId: string): Promise<PassengerOption[]> {
  const [saved, bookings] = await Promise.all([listWithKeys(userId), listBookingsByUser(userId)]);
  const seen = new Set(saved.map((s) => s.passportKey));
  const out: PassengerOption[] = saved.map((s) => ({ ref: `saved:${s.id}`, nameEn: s.nameEn, nationality: s.nationality, passportMasked: s.passportNoMasked, birthDate: s.birthDate || null }));
  for (const b of bookings) {
    if (b.status === "CANCELLED") continue;
    for (const a of b.applicants) {
      const key = passportKey(a);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ref: `booking:${b.id}:${a.applicationNo}`, nameEn: a.nameEn, nationality: a.nationality, passportMasked: mask(a.passportNo), birthDate: null });
    }
  }
  return out;
}

export interface PassengerInput {
  type: PassengerType;
  ref?: string;
  nameEn?: string;
  nationality?: string;
  passportNo?: string;
}

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.iso2));

async function resolvePassenger(userId: string, p: PassengerInput): Promise<{ nameEn: string; nationality: string; passportNo: string; type: PassengerType }> {
  if (p.type !== "adult" && p.type !== "child") throw new TrainOrderError("invalidPassenger");
  if (p.ref?.startsWith("saved:")) {
    const s = await getSavedTraveller(userId, p.ref.slice(6));
    if (!s) throw new TrainOrderError("invalidPassenger");
    const nameEn = [s.firstNameEn, s.middleNameEn, s.grandFatherNameEn, s.familyNameEn].filter(Boolean).join(" ");
    return { nameEn, nationality: s.nationality, passportNo: s.passportNo, type: p.type };
  }
  if (p.ref?.startsWith("booking:")) {
    const [, bookingId, appNo] = p.ref.split(":");
    const b = (await listBookingsByUser(userId)).find((x) => x.id === bookingId);
    const a = b?.applicants.find((x) => x.applicationNo === appNo);
    if (!a) throw new TrainOrderError("invalidPassenger");
    return { nameEn: a.nameEn, nationality: a.nationality, passportNo: a.passportNo, type: p.type };
  }
  const nameEn = (p.nameEn ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const nationality = (p.nationality ?? "").trim().toUpperCase();
  const passportNo = (p.passportNo ?? "").trim().toUpperCase();
  if (!/^[A-Z][A-Z' -]{1,59}$/.test(nameEn) || !nameEn.includes(" ")) throw new TrainOrderError("invalidPassenger");
  if (!COUNTRY_CODES.has(nationality) || !/^[A-Z0-9]{5,15}$/.test(passportNo)) throw new TrainOrderError("invalidPassenger");
  return { nameEn, nationality, passportNo, type: p.type };
}

/* ---------------------------------------------------------- seats */

interface RunSeats {
  id: string;
  /** Seat → order id. */
  taken: Record<string, string>;
}

async function runDoc(runId: string): Promise<RunSeats> {
  const s = store();
  const doc = await s.get<RunSeats>("trainSeats", runId);
  if (doc) return doc;
  await s.insert<RunSeats>("trainSeats", runId, { id: runId, taken: {} });
  return (await s.get<RunSeats>("trainSeats", runId)) ?? { id: runId, taken: {} };
}

/** Unavailable seats of a trip's train. */
export async function unavailableSeats(runId: string, cls: TrainClass): Promise<string[]> {
  const doc = await runDoc(runId);
  return allSeats(cls).filter((s) => doc.taken[s] || sarSoldSeat(runId, s));
}

async function hold(runId: string, seats: string[], orderId: string): Promise<boolean> {
  await runDoc(runId);
  let ok = true;
  await store().update<RunSeats>("trainSeats", runId, (doc) => {
    if (seats.some((s) => doc.taken[s] || sarSoldSeat(runId, s))) {
      ok = false;
      return doc;
    }
    const taken = { ...doc.taken };
    for (const s of seats) taken[s] = orderId;
    return { ...doc, taken };
  });
  return ok;
}

async function releaseSeats(runId: string, seats: string[], orderId: string) {
  await store().update<RunSeats>("trainSeats", runId, (doc) => {
    const taken = { ...doc.taken };
    for (const s of seats) if (taken[s] === orderId) delete taken[s];
    return { ...doc, taken };
  });
}

/* ---------------------------------------------------------- purchase */

export interface TrainOrderInput {
  legs: { tripId: string; cls: TrainClass; seats: string[] }[];
  passengers: PassengerInput[];
  expectedTotalSAR: number;
  idempotencyKey: string;
  displayCurrency?: string;
  card: CardInput;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Validated legs and price (no availability check). */
export function priceOrder(input: Pick<TrainOrderInput, "legs" | "passengers">, now = new Date()) {
  if (!Array.isArray(input.legs) || input.legs.length < 1 || input.legs.length > 2) throw new TrainOrderError("invalidTrip");
  const n = Array.isArray(input.passengers) ? input.passengers.length : 0;
  if (n < 1 || n > MAX_PASSENGERS) throw new TrainOrderError("passengerCount");
  if (!input.passengers.some((p) => p.type === "adult")) throw new TrainOrderError("adultRequired");
  const legs: OrderLeg[] = input.legs.map((l, i) => {
    const trip = typeof l.tripId === "string" ? tripById(l.tripId) : null;
    if (!trip || (l.cls !== "economy" && l.cls !== "business")) throw new TrainOrderError("invalidTrip");
    if (Date.parse(trip.depart) - now.getTime() < SALES_CLOSE_MINUTES * 60_000) throw new TrainOrderError("tripClosed");
    const seats = Array.isArray(l.seats) ? l.seats : [];
    if (seats.length !== n || new Set(seats).size !== n || seats.some((s) => seatInfo(s)?.coach.cls !== l.cls)) throw new TrainOrderError("invalidSeats");
    return { kind: i === 0 ? "outbound" : "return", trip, cls: l.cls };
  });
  if (legs[1]) {
    const [a, b] = legs;
    if (b.trip.from !== a.trip.to || b.trip.to !== a.trip.from || Date.parse(b.trip.depart) <= Date.parse(a.trip.arrive)) throw new TrainOrderError("invalidReturn");
  }
  const lines = legs.flatMap((leg, li) => input.passengers.map((p, pi) => ({ leg: li, passenger: pi, seat: input.legs[li].seats[pi], priceSAR: leg.trip.fares[leg.cls][p.type === "child" ? "child" : "adult"] })));
  return { legs, lines, totalSAR: round2(lines.reduce((a, l) => a + l.priceSAR, 0)) };
}

export async function placeTrainOrder(user: PublicUser, input: TrainOrderInput, now = new Date()): Promise<TrainOrder> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new TrainOrderError("idempotencyKey", 400);
  const id = createHash("sha256").update(`${user.id}|train|${input.idempotencyKey}`).digest("hex").slice(0, 24);
  const existing = await store().get<TrainOrder>("trainOrders", id);
  if (existing) return existing;

  const { legs, lines, totalSAR } = priceOrder(input, now);
  const people = await Promise.all(input.passengers.map((p) => resolvePassenger(user.id, p)));
  if (new Set(people.map((p) => `${p.nationality}:${p.passportNo}`)).size !== people.length) throw new TrainOrderError("duplicatePassenger");
  if (Math.abs(totalSAR - Number(input.expectedTotalSAR)) > 0.01) throw new TrainOrderError("priceChanged", 409);

  const held: number[] = [];
  for (let i = 0; i < legs.length; i++) {
    if (!(await hold(legs[i].trip.runId, input.legs[i].seats, id))) {
      for (const j of held) await releaseSeats(legs[j].trip.runId, input.legs[j].seats, id);
      throw new TrainOrderError("seatUnavailable", 409);
    }
    held.push(i);
  }
  const pay = await chargeCard(input.card, totalSAR, now);
  if (!pay.ok) {
    for (const j of held) await releaseSeats(legs[j].trip.runId, input.legs[j].seats, id);
    throw new TrainOrderError(`payment_${pay.code}`, 402);
  }
  // Passenger names and passports are sent to SAR with the booking (sandbox: issued here).
  const issued = await sarIssue(lines.length);
  const order: TrainOrder = {
    id,
    reference: `TR-${randomBytes(4).toString("hex").toUpperCase()}`,
    pnr: issued.pnr,
    userId: user.id,
    idempotencyKey: input.idempotencyKey,
    createdAt: now.toISOString(),
    status: "CONFIRMED",
    legs,
    passengers: people.map((p) => ({ nameEn: p.nameEn, nationality: p.nationality, passportMasked: mask(p.passportNo), type: p.type })),
    tickets: lines.map((l, i) => ({ id: randomUUID(), code: issued.codes[i], ...l })),
    totalSAR,
    displayCurrency: input.displayCurrency ?? "SAR",
    payment: { transactionId: pay.transactionId, method: pay.method, last4: pay.last4, amountSAR: totalSAR, paidAt: now.toISOString() },
    buyerEmail: user.email,
    cancellation: null,
  };
  if (!(await store().insert("trainOrders", id, order))) {
    await refundPayment(pay.transactionId, totalSAR);
    return (await store().get<TrainOrder>("trainOrders", id))!;
  }
  await notifyTravellers([user.email], trainEmail(order, "confirmed", user.preferredLocale));
  return order;
}

/* ---------------------------------------------------------- orders */

export async function listTrainOrders(userId: string): Promise<TrainOrder[]> {
  return (await store().findBy<TrainOrder>("trainOrders", "userId", userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTrainOrder(userId: string, id: string): Promise<TrainOrder | null> {
  const o = await store().get<TrainOrder>("trainOrders", id);
  return o && o.userId === userId ? o : null;
}

export const cancelDeadline = (o: TrainOrder) => new Date(Date.parse(o.legs[0].trip.depart) - CANCEL_CLOSE_HOURS * 3_600_000).toISOString();

export function canCancelTrain(o: TrainOrder, now = new Date()): boolean {
  return o.status === "CONFIRMED" && now.getTime() < Date.parse(cancelDeadline(o));
}

/** Refund if cancelled now: each ticket by its leg's departure. */
export function refundQuote(o: TrainOrder, now = new Date()): { refundSAR: number; feeSAR: number } {
  const refundSAR = round2(o.tickets.reduce((a, t) => a + t.priceSAR * refundShare(o.legs[t.leg].trip.depart, now), 0));
  return { refundSAR, feeSAR: round2(o.totalSAR - refundSAR) };
}

export async function cancelTrainOrder(user: PublicUser, id: string, now = new Date()): Promise<TrainOrder> {
  const o = await getTrainOrder(user.id, id);
  if (!o) throw new TrainOrderError("notFound", 404);
  if (!canCancelTrain(o, now)) throw new TrainOrderError("notCancellable");
  const q = refundQuote(o, now);
  let claimed = false;
  await store().update<TrainOrder>("trainOrders", id, (cur) => {
    if (cur.status !== "CONFIRMED") return cur;
    claimed = true;
    return { ...cur, status: "CANCELLED", cancellation: { at: now.toISOString(), ...q, refundId: "" } };
  });
  if (!claimed) throw new TrainOrderError("notCancellable");
  const refund = q.refundSAR > 0 ? await refundPayment(o.payment.transactionId, q.refundSAR) : null;
  await sarCancel(o.pnr);
  for (let i = 0; i < o.legs.length; i++) await releaseSeats(o.legs[i].trip.runId, o.tickets.filter((t) => t.leg === i).map((t) => t.seat), o.id);
  const done = await store().update<TrainOrder>("trainOrders", id, (cur) => ({ ...cur, cancellation: { ...cur.cancellation!, refundId: refund?.ok ? refund.refundId : "" } }));
  await notifyTravellers([o.buyerEmail], trainEmail(done!, "cancelled", user.preferredLocale));
  return done!;
}

/* ---------------------------------------------------------- email */

function trainEmail(o: TrainOrder, kind: "confirmed" | "cancelled", locale: "ar" | "en") {
  const ar = locale === "ar";
  const when = (iso: string) => new Date(iso).toLocaleString(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "full", timeStyle: "short" });
  const st = (c: string) => {
    const s = stationByCode(c);
    return s ? (ar ? s.nameAr : s.nameEn) : c;
  };
  const legs = o.legs.map((l) => {
    const line = lineById(l.trip.lineId);
    const seats = o.tickets.filter((t) => t.leg === o.legs.indexOf(l)).map((t) => `${o.passengers[t.passenger].nameEn}: ${t.seat} (${t.code})`).join("\n  ");
    return `${line ? (ar ? line.nameAr : line.nameEn) : ""} ${l.trip.trainNo}\n${st(l.trip.from)} → ${st(l.trip.to)}\n${when(l.trip.depart)}\n  ${seats}`;
  }).join("\n\n");
  if (kind === "confirmed") {
    return ar
      ? { subject: `تذاكر القطار ${o.reference}`, text: `تم تأكيد حجز القطار ${o.reference} (PNR ${o.pnr}).\n\n${legs}\n\nالمبلغ: ${o.totalSAR} ريال\nالتذاكر محفوظة في محفظتك الرقمية. أحضر جواز سفر كل راكب عند السفر.` }
      : { subject: `Train tickets ${o.reference}`, text: `Your train booking ${o.reference} (PNR ${o.pnr}) is confirmed.\n\n${legs}\n\nAmount: SAR ${o.totalSAR}\nTickets are saved in your digital wallet. Each passenger must carry their passport.` };
  }
  const c = o.cancellation!;
  return ar
    ? { subject: `إلغاء حجز القطار ${o.reference}`, text: `تم إلغاء حجز القطار ${o.reference}.\nالمبلغ المسترد: ${c.refundSAR} ريال (رسوم الإلغاء ${c.feeSAR} ريال) إلى البطاقة المستخدمة.` }
    : { subject: `Train booking ${o.reference} cancelled`, text: `Your train booking ${o.reference} has been cancelled.\nRefund: SAR ${c.refundSAR} (cancellation fee SAR ${c.feeSAR}) to the card used.` };
}
