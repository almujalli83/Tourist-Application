/**
 * Hotels booked without a tourism package (tourist eVisa, visa on arrival, stopover, GCC, residents
 * and citizens). The same standard as packages: MT-licensed hotels of 3 to 5 stars, from every agent.
 * A rate is paid online now (refundable until its deadline, or not), or at the hotel on arrival.
 * Prices are never taken from the browser: offers are signed by the server when searched.
 */
import { randomBytes } from "node:crypto";
import { hotelPaxKey, quoteHotelDates, searchHotels } from "../agents/aggregator";
import { verifyOffer } from "../agents/offer-signing";
import { AgentBookingError } from "../agents/provider";
import { AGENTS } from "../agents/registry";
import type { PublicUser } from "../auth/types";
import { EMAIL_RE } from "../auth/validation";
import { hotelClassAllowed } from "../config";
import { getStayCity, UMRAH_CITY } from "../data/cities";
import { addDays, diffDays, isValidISODate } from "../dates";
import { awardPurchase, ksaDate, ksaDayStart, quietly, reversePurchase } from "../loyalty/loyalty";
import { notifyTravellers } from "../notify";
import { paxFromRooms, validateRooms } from "../occupancy";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { validatePhone } from "../phone";
import type { AppNotification } from "../reminders/reminders";
import { getUserById } from "../repo";
import { store } from "../store";
import type { HotelOffer, RoomOccupancy } from "../types";
import { isEntryType, STOPOVER, type EntryType } from "./entry";
import type { StayOrder } from "./types";

export class StayError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

type Stored = StayOrder & { userId: string };
const COL = "stays" as const;
export const MAX_NIGHTS = 30;
const round2 = (n: number) => Math.round(n * 100) / 100;
const strip = ({ userId: _u, ...o }: Stored): StayOrder => o; // eslint-disable-line @typescript-eslint/no-unused-vars
const unsigned = ({ sig: _s, expiresAt: _e, ...o }: HotelOffer) => o; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface StayQuery { city: string; checkIn: string; checkOut: string; rooms: RoomOccupancy[]; entry?: EntryType; umrah?: boolean }

/** Checks a search or booking query; `now` sets "today" in the Kingdom. */
export function validateStayQuery(q: Partial<StayQuery>, now = new Date()): StayQuery {
  const city = String(q.city ?? "");
  if (!getStayCity(city)) throw new StayError("city");
  // Makkah: Muslims only (the traveller declares it, as in the Umrah option of packages).
  if (city === UMRAH_CITY && q.umrah !== true) throw new StayError("makkahMuslimsOnly");
  const checkIn = String(q.checkIn ?? "");
  const checkOut = String(q.checkOut ?? "");
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) throw new StayError("dates");
  if (checkIn < ksaDate(now) || checkIn > addDays(ksaDate(now), 365)) throw new StayError("dates");
  const nights = diffDays(checkIn, checkOut);
  if (nights < 1 || nights > MAX_NIGHTS) throw new StayError("nights");
  if (q.entry === "stopover" && nights > STOPOVER.maxNights) throw new StayError("stopoverNights");
  const rooms = Array.isArray(q.rooms) ? q.rooms : [];
  if (!rooms.length || validateRooms(rooms).some((e) => e === "rooms" || e === "childAges")) throw new StayError("rooms");
  return { city, checkIn, checkOut, rooms, entry: isEntryType(q.entry) ? q.entry : undefined, umrah: q.umrah === true };
}

/** Licensed 3–5★ hotels from every agent, prepaid and pay-at-hotel rates, cheapest first. */
export async function searchStays(q: Partial<StayQuery>, now = new Date()) {
  const v = validateStayQuery(q, now);
  const res = await searchHotels({ city: v.city, checkIn: v.checkIn, checkOut: v.checkOut, rooms: v.rooms, pax: paxFromRooms(v.rooms), standalone: true });
  return { ...res, offers: res.offers.filter((o) => !!o.rate) };
}

/** Free cancellation still open (the deadline is in Saudi time). */
export const freeCancelOpen = (o: Pick<StayOrder, "freeCancelUntil">, now = new Date()) => !!o.freeCancelUntil && Date.parse(o.freeCancelUntil) > now.getTime();

/**
 * What cancelling now means. Prepaid: full refund before the deadline; after it, a refundable rate
 * keeps the first night and a non-refundable rate keeps everything. Pay-at-hotel: nothing was paid;
 * after the deadline the hotel may charge the first night (shown as a fee).
 */
export function stayCancelTerms(o: StayOrder, now = new Date()): { allowed: boolean; refundSAR: number; feeSAR: number } {
  if (o.status !== "confirmed" || ksaDate(now) >= o.hotel.checkIn) return { allowed: false, refundSAR: 0, feeSAR: 0 };
  const paid = o.payment?.amountSAR ?? 0;
  if (freeCancelOpen(o, now)) return { allowed: true, refundSAR: paid, feeSAR: 0 };
  const firstNight = Math.min(o.totalSAR, o.hotel.pricePerNightSAR);
  if (o.pay === "hotel") return { allowed: true, refundSAR: 0, feeSAR: firstNight };
  if (o.hotel.refundable) return { allowed: true, refundSAR: round2(paid - firstNight), feeSAR: firstNight };
  return { allowed: true, refundSAR: 0, feeSAR: paid };
}

export interface StayBookingInput {
  offer?: HotelOffer;
  city?: string;
  checkIn?: string;
  checkOut?: string;
  rooms?: RoomOccupancy[];
  entry?: string;
  umrah?: boolean;
  lead?: { name?: string; email?: string; phone?: string };
  requests?: string;
  expectedTotalSAR?: number;
  card?: CardInput;
}

function cleanLead(l: StayBookingInput["lead"]): StayOrder["lead"] {
  const name = String(l?.name ?? "").trim().replace(/\s+/g, " ");
  const email = String(l?.email ?? "").trim().toLowerCase();
  const phone = String(l?.phone ?? "").replace(/[\s-]/g, "");
  if (name.length < 3 || name.length > 80 || !name.includes(" ")) throw new StayError("leadName");
  if (!EMAIL_RE.test(email)) throw new StayError("email");
  if (validatePhone(phone)) throw new StayError("phone");
  return { name, email, phone };
}

/** The offer the traveller chose, checked against the server's signature and the query. */
function checkedOffer(offer: HotelOffer | undefined, q: StayQuery): HotelOffer {
  if (!offer || !verifyOffer(offer)) throw new StayError("offerExpired", 409);
  if (offer.city !== q.city || offer.checkIn !== q.checkIn || offer.checkOut !== q.checkOut || offer.forPax !== hotelPaxKey(paxFromRooms(q.rooms), q.rooms)) throw new StayError("offerMismatch", 409);
  if (!hotelClassAllowed(offer) || !offer.rate) throw new StayError("offerMismatch", 409);
  return offer;
}

const agentOf = (id: string) => {
  const a = AGENTS.find((x) => x.id === id);
  if (!a) throw new StayError("agentUnavailable", 502);
  return a;
};

async function bookWithAgent(offer: HotelOffer, reference: string, lead: StayOrder["lead"], rooms: RoomOccupancy[], requests: string): Promise<string> {
  try {
    return (await agentOf(offer.agentId).bookHotel({ offer, reference, lead, rooms, requests })).confirmation;
  } catch (e) {
    throw new StayError(e instanceof AgentBookingError && e.code === "rejected" ? "agentRejected" : "agentUnavailable", 502);
  }
}

/** Books the chosen rate: charges it online (then books), or books it to pay at the hotel. */
export async function bookStay(user: PublicUser, input: StayBookingInput, now = new Date()): Promise<StayOrder> {
  if (!isEntryType(input.entry)) throw new StayError("entry");
  const q = validateStayQuery({ city: input.city, checkIn: input.checkIn, checkOut: input.checkOut, rooms: input.rooms, entry: input.entry, umrah: input.umrah }, now);
  const offer = checkedOffer(input.offer, q);
  if (Math.abs(offer.totalSAR - Number(input.expectedTotalSAR)) > 0.01) throw new StayError("priceChanged", 409);
  const lead = cleanLead(input.lead);
  const requests = String(input.requests ?? "").trim().slice(0, 500);
  const id = randomBytes(10).toString("hex");
  const reference = `ST-${randomBytes(3).toString("hex").toUpperCase()}`;
  const pay = offer.rate!.pay;
  // A deadline already passed at booking time makes the rate non-refundable from the start.
  const freeCancelUntil = offer.rate!.freeCancelUntil && Date.parse(offer.rate!.freeCancelUntil) > now.getTime() ? offer.rate!.freeCancelUntil : null;
  let payment: StayOrder["payment"] = null;
  if (pay === "online") {
    if (!input.card) throw new StayError("invalid_card");
    const paid = await chargeCard(input.card, offer.totalSAR, now);
    if (!paid.ok) throw new StayError(paid.code, 402);
    payment = { transactionId: paid.transactionId, method: paid.method, last4: paid.last4, amountSAR: offer.totalSAR, paidAt: now.toISOString() };
  }
  let confirmation: string;
  try {
    confirmation = await bookWithAgent(offer, reference, lead, q.rooms, requests);
  } catch (e) {
    if (payment) await refundPayment(payment.transactionId, payment.amountSAR);
    throw e;
  }
  const order: Stored = {
    id, userId: user.id, reference, confirmation, entry: input.entry, hotel: unsigned(offer), rooms: q.rooms, lead, requests, pay,
    totalSAR: offer.totalSAR, freeCancelUntil, status: "confirmed", payment, cancellation: null, changes: [], createdAt: now.toISOString(),
    ...(agentOf(offer.agentId).sandbox ? { sandbox: true } : {}),
  };
  if (payment) {
    const earned = await quietly("stay points", () => awardPurchase(user, { service: "stay", source: { kind: "stay", id, reference }, eligibleSAR: payment!.amountSAR, availableAt: ksaDayStart(q.checkOut), cities: [q.city] }, now), 0);
    if (earned) order.loyalty = { earnedPoints: earned };
  }
  await store().put(COL, id, order);
  await notifyTravellers([user.email, ...(lead.email !== user.email ? [lead.email] : [])], {
    subject: `Saudi Trip — ${offer.nameEn} ${q.checkIn} (${confirmation})`,
    text: [
      `${offer.nameEn}, ${offer.districtEn} — ${q.checkIn} → ${q.checkOut} (${offer.nights} nights), ${offer.roomTypeEn}. Confirmation ${confirmation}, booking ${reference}.`,
      pay === "online" ? `Paid online: SAR ${offer.totalSAR}.` : `Pay at the hotel on arrival: SAR ${offer.totalSAR}. The hotel may ask for a card to guarantee the booking.`,
      freeCancelUntil ? `Free cancellation until ${freeCancelUntil.slice(0, 16).replace("T", " ")} (Saudi time).` : "Non-refundable rate.",
      "",
      `${offer.nameAr}، ${offer.districtAr} — ${q.checkIn} ← ${q.checkOut} (${offer.nights} ليالٍ). رقم التأكيد ${confirmation}، الحجز ${reference}.`,
      pay === "online" ? `مدفوع إلكترونيًا: ${offer.totalSAR} ريال.` : `الدفع في الفندق عند الوصول: ${offer.totalSAR} ريال. قد يطلب الفندق بطاقة لضمان الحجز.`,
    ].join("\n"),
  }).catch(() => undefined);
  return strip(order);
}

export async function listStays(userId: string): Promise<StayOrder[]> {
  return (await store().findBy<Stored>(COL, "userId", userId)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getStay(userId: string, id: string): Promise<StayOrder | null> {
  const o = await store().get<Stored>(COL, id);
  return o && o.userId === userId ? strip(o) : null;
}

export async function cancelStay(user: PublicUser, id: string, now = new Date()): Promise<StayOrder> {
  const o = await store().get<Stored>(COL, id);
  if (!o || o.userId !== user.id) throw new StayError("notFound", 404);
  const terms = stayCancelTerms(o, now);
  if (!terms.allowed) throw new StayError("cannotCancel", 409);
  try {
    await agentOf(o.hotel.agentId).cancelHotel(o.confirmation);
  } catch {
    throw new StayError("agentUnavailable", 502);
  }
  if (terms.refundSAR > 0 && o.payment) await refundPayment(o.payment.transactionId, terms.refundSAR);
  if (o.payment && terms.refundSAR > 0) await quietly("stay points reversal", () => reversePurchase(user.id, [o.id, ...o.changes.map((_, i) => `${o.id}:chg${i}`)], terms.refundSAR / o.payment!.amountSAR, now), 0);
  const done = await store().update<Stored>(COL, id, (x) => ({ ...x, status: "cancelled", cancellation: { at: now.toISOString(), refundSAR: terms.refundSAR, feeSAR: terms.feeSAR } }));
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — hotel booking cancelled (${o.reference})`,
    text: [`${o.hotel.nameEn}, ${o.hotel.checkIn}: cancelled.${terms.refundSAR ? ` SAR ${terms.refundSAR} will be refunded to your card.` : ""}`, `${o.hotel.nameAr}، ${o.hotel.checkIn}: أُلغي الحجز.${terms.refundSAR ? ` سيُعاد ${terms.refundSAR} ريال إلى بطاقتك.` : ""}`].join("\n"),
  }).catch(() => undefined);
  return strip(done!);
}

/* ---------------------------------------------------------------- multi-city trips */

export const MAX_TRIP_CITIES = 5;

/** A failure tied to one hotel of a trip (the page asks for another hotel in that city). */
export class StayTripError extends StayError {
  constructor(code: string, status: number, public leg: number) {
    super(code, status);
  }
}

export interface StayTripLeg { offer?: HotelOffer; city?: string; checkIn?: string; checkOut?: string; expectedTotalSAR?: number }

export interface StayTripInput {
  entry?: string;
  rooms?: RoomOccupancy[];
  /** Declared by Muslims staying in Makkah. */
  umrah?: boolean;
  lead?: { name?: string; email?: string; phone?: string };
  requests?: string;
  legs?: StayTripLeg[];
  card?: CardInput;
}

/** The trip's cities in order, each checking out the day the next checks in. */
export function validateTripLegs(input: Pick<StayTripInput, "entry" | "rooms" | "umrah" | "legs">, now = new Date()): StayQuery[] {
  const legs = Array.isArray(input.legs) ? input.legs : [];
  if (legs.length < 2 || legs.length > MAX_TRIP_CITIES) throw new StayError("tripCities");
  const entry = isEntryType(input.entry) ? input.entry : undefined;
  const qs = legs.map((l, i) => {
    try {
      return validateStayQuery({ city: l.city, checkIn: l.checkIn, checkOut: l.checkOut, rooms: input.rooms, entry, umrah: l.city === UMRAH_CITY && input.umrah === true }, now);
    } catch (e) {
      throw e instanceof StayError ? new StayTripError(e.code, e.status, i) : e;
    }
  });
  for (let i = 1; i < qs.length; i++) {
    if (qs[i].checkIn !== qs[i - 1].checkOut) throw new StayTripError("tripDates", 422, i);
    if (qs[i].city === qs[i - 1].city) throw new StayTripError("tripSameCity", 422, i);
  }
  const nights = diffDays(qs[0].checkIn, qs[qs.length - 1].checkOut);
  if (nights > MAX_NIGHTS) throw new StayError("nights");
  if (entry === "stopover" && nights > STOPOVER.maxNights) throw new StayError("stopoverNights");
  return qs;
}

/**
 * Books a hotel in each city of a trip, all or nothing: one online charge for the prepaid rates
 * (pay-at-hotel rates are not charged), then each hotel with its agent. If one cannot be confirmed,
 * the others are cancelled and the charge refunded; the error names that hotel so the traveller can
 * choose another in the same city and keep the rest. Each hotel then remains its own booking.
 */
export async function bookStayTrip(user: PublicUser, input: StayTripInput, now = new Date()): Promise<{ trip: { id: string; reference: string }; stays: StayOrder[] }> {
  if (!isEntryType(input.entry)) throw new StayError("entry");
  const entry = input.entry;
  const qs = validateTripLegs(input, now);
  const legs = input.legs!;
  const offers = qs.map((q, i) => {
    try {
      const offer = checkedOffer(legs[i].offer, q);
      if (Math.abs(offer.totalSAR - Number(legs[i].expectedTotalSAR)) > 0.01) throw new StayError("priceChanged", 409);
      return offer;
    } catch (e) {
      throw e instanceof StayError ? new StayTripError(e.code, e.status, i) : e;
    }
  });
  const lead = cleanLead(input.lead);
  const requests = String(input.requests ?? "").trim().slice(0, 500);
  const tripId = randomBytes(10).toString("hex");
  const tripRef = `TP-${randomBytes(3).toString("hex").toUpperCase()}`;
  const refs = qs.map(() => `ST-${randomBytes(3).toString("hex").toUpperCase()}`);

  const onlineSAR = round2(offers.filter((o) => o.rate!.pay === "online").reduce((a, o) => a + o.totalSAR, 0));
  let charge: { transactionId: string; method: string; last4: string } | null = null;
  if (onlineSAR > 0) {
    if (!input.card) throw new StayError("invalid_card");
    const paid = await chargeCard(input.card, onlineSAR, now);
    if (!paid.ok) throw new StayError(paid.code, 402);
    charge = { transactionId: paid.transactionId, method: paid.method, last4: paid.last4 };
  }

  const confirmed: { agentId: string; confirmation: string }[] = [];
  for (let i = 0; i < offers.length; i++) {
    try {
      confirmed.push({ agentId: offers[i].agentId, confirmation: await bookWithAgent(offers[i], refs[i], lead, qs[i].rooms, requests) });
    } catch (e) {
      // All or nothing: release the hotels already confirmed and return the money.
      for (const c of confirmed) await agentOf(c.agentId).cancelHotel(c.confirmation).catch(() => undefined);
      if (charge) await refundPayment(charge.transactionId, onlineSAR);
      throw new StayTripError(e instanceof StayError ? e.code : "agentUnavailable", 502, i);
    }
  }

  const stays: Stored[] = [];
  for (let i = 0; i < offers.length; i++) {
    const offer = offers[i];
    const q = qs[i];
    const id = randomBytes(10).toString("hex");
    const pay = offer.rate!.pay;
    const payment: StayOrder["payment"] = pay === "online" && charge ? { ...charge, amountSAR: offer.totalSAR, paidAt: now.toISOString() } : null;
    const order: Stored = {
      id, userId: user.id, reference: refs[i], confirmation: confirmed[i].confirmation, entry, hotel: unsigned(offer), rooms: q.rooms, lead, requests, pay,
      totalSAR: offer.totalSAR, freeCancelUntil: offer.rate!.freeCancelUntil && Date.parse(offer.rate!.freeCancelUntil) > now.getTime() ? offer.rate!.freeCancelUntil : null,
      status: "confirmed", payment, cancellation: null, changes: [], createdAt: now.toISOString(),
      trip: { id: tripId, reference: tripRef, index: i, count: offers.length },
      ...(agentOf(offer.agentId).sandbox ? { sandbox: true } : {}),
    };
    if (payment) {
      const earned = await quietly("stay points", () => awardPurchase(user, { service: "stay", source: { kind: "stay", id, reference: refs[i] }, eligibleSAR: payment.amountSAR, availableAt: ksaDayStart(q.checkOut), cities: [q.city] }, now), 0);
      if (earned) order.loyalty = { earnedPoints: earned };
    }
    await store().put(COL, id, order);
    stays.push(order);
  }

  const atHotelSAR = round2(offers.filter((o) => o.rate!.pay === "hotel").reduce((a, o) => a + o.totalSAR, 0));
  await notifyTravellers([user.email, ...(lead.email !== user.email ? [lead.email] : [])], {
    subject: `Saudi Trip — your ${offers.length}-city hotel trip ${tripRef}`,
    text: [
      ...stays.map((o) => `${o.hotel.checkIn} → ${o.hotel.checkOut}: ${o.hotel.nameEn} (${o.hotel.city}) — ${o.pay === "online" ? "paid" : "pay at the hotel"} SAR ${o.totalSAR}, confirmation ${o.confirmation}.`),
      ...(onlineSAR ? [`Paid online: SAR ${onlineSAR}.`] : []),
      ...(atHotelSAR ? [`To pay at the hotels: SAR ${atHotelSAR}.`] : []),
      "",
      ...stays.map((o) => `${o.hotel.checkIn} ← ${o.hotel.checkOut}: ${o.hotel.nameAr} — ${o.pay === "online" ? "مدفوع" : "الدفع في الفندق"} ${o.totalSAR} ريال، رقم التأكيد ${o.confirmation}.`),
    ].join("\n"),
  }).catch(() => undefined);
  return { trip: { id: tripId, reference: tripRef }, stays: stays.map(strip) };
}

/* ---------------------------------------------------------------- date changes */

/** A trip's hotel may move, but not into the nights of another hotel of the same trip. */
async function checkTripOverlap(o: Stored, checkIn: string, checkOut: string) {
  if (!o.trip) return;
  const others = (await store().findBy<Stored>(COL, "userId", o.userId)).filter((x) => x.id !== o.id && x.trip?.id === o.trip!.id && x.status === "confirmed");
  if (others.some((x) => x.hotel.checkIn < checkOut && x.hotel.checkOut > checkIn)) throw new StayError("tripOverlap", 409);
}

/**
 * New dates for the same hotel, room and rate type, quoted by the agent that booked it. Allowed
 * while free cancellation is open. Returns the signed offer and the difference to pay (or refund).
 */
export async function quoteStayChange(userId: string, id: string, dates: { checkIn?: string; checkOut?: string }, now = new Date()) {
  const o = await store().get<Stored>(COL, id);
  if (!o || o.userId !== userId) throw new StayError("notFound", 404);
  if (o.status !== "confirmed" || !freeCancelOpen(o, now)) throw new StayError("cannotChange", 409);
  const q = validateStayQuery({ city: o.hotel.city, checkIn: dates.checkIn, checkOut: dates.checkOut, rooms: o.rooms, entry: o.entry, umrah: o.hotel.city === UMRAH_CITY }, now);
  if (q.checkIn === o.hotel.checkIn && q.checkOut === o.hotel.checkOut) throw new StayError("sameDates");
  await checkTripOverlap(o, q.checkIn, q.checkOut);
  const offer = await quoteHotelDates(o.hotel as HotelOffer, q.checkIn, q.checkOut);
  if (!offer) throw new StayError("noAvailability", 409);
  return { offer, differenceSAR: round2(offer.totalSAR - o.totalSAR) };
}

/** Moves the booking to the quoted dates: the agent rebooks; the difference is charged or refunded. */
export async function changeStayDates(user: PublicUser, id: string, input: { offer?: HotelOffer; card?: CardInput }, now = new Date()): Promise<StayOrder> {
  const o = await store().get<Stored>(COL, id);
  if (!o || o.userId !== user.id) throw new StayError("notFound", 404);
  if (o.status !== "confirmed" || !freeCancelOpen(o, now)) throw new StayError("cannotChange", 409);
  const q = validateStayQuery({ city: o.hotel.city, checkIn: input.offer?.checkIn, checkOut: input.offer?.checkOut, rooms: o.rooms, entry: o.entry, umrah: o.hotel.city === UMRAH_CITY }, now);
  const offer = checkedOffer(input.offer, q);
  await checkTripOverlap(o, q.checkIn, q.checkOut);
  if (offer.agentId !== o.hotel.agentId || offer.licenseNo !== o.hotel.licenseNo || offer.rate?.pay !== o.pay) throw new StayError("offerMismatch", 409);
  const diff = round2(offer.totalSAR - o.totalSAR);
  let chargedSAR = 0;
  let refundedSAR = 0;
  let extraTx: string | null = null;
  if (o.pay === "online" && diff > 0) {
    if (!input.card) throw new StayError("invalid_card");
    const paid = await chargeCard(input.card, diff, now);
    if (!paid.ok) throw new StayError(paid.code, 402);
    chargedSAR = diff;
    extraTx = paid.transactionId;
  }
  let confirmation: string;
  try {
    confirmation = await bookWithAgent(offer, o.reference, o.lead, o.rooms, o.requests);
  } catch (e) {
    if (extraTx) await refundPayment(extraTx, chargedSAR);
    throw e;
  }
  await agentOf(o.hotel.agentId).cancelHotel(o.confirmation).catch(() => undefined);
  if (o.pay === "online" && diff < 0 && o.payment) {
    await refundPayment(o.payment.transactionId, -diff);
    refundedSAR = -diff;
    await quietly("stay points reversal", () => reversePurchase(user.id, [o.id], refundedSAR / o.payment!.amountSAR, now), 0);
  }
  const n = o.changes.length;
  if (chargedSAR > 0) await quietly("stay change points", () => awardPurchase(user, { service: "stay", source: { kind: "stay", id: `${o.id}:chg${n}`, reference: o.reference }, eligibleSAR: chargedSAR, availableAt: ksaDayStart(q.checkOut), cities: [q.city] }, now), 0);
  const freeCancelUntil = offer.rate!.freeCancelUntil && Date.parse(offer.rate!.freeCancelUntil) > now.getTime() ? offer.rate!.freeCancelUntil : null;
  const done = await store().update<Stored>(COL, id, (x) => ({
    ...x, confirmation, hotel: unsigned(offer), totalSAR: offer.totalSAR, freeCancelUntil,
    changes: [...x.changes, { at: now.toISOString(), from: { checkIn: x.hotel.checkIn, checkOut: x.hotel.checkOut, totalSAR: x.totalSAR }, to: { checkIn: offer.checkIn, checkOut: offer.checkOut, totalSAR: offer.totalSAR }, chargedSAR, refundedSAR }],
  }));
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — new hotel dates (${o.reference})`,
    text: [`${offer.nameEn}: now ${offer.checkIn} → ${offer.checkOut}. Confirmation ${confirmation}.`, `${offer.nameAr}: التواريخ الجديدة ${offer.checkIn} ← ${offer.checkOut}. رقم التأكيد ${confirmation}.`].join("\n"),
  }).catch(() => undefined);
  return strip(done!);
}

/* ---------------------------------------------------------------- reminders */

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }).catch(() => undefined);
}

/** The day before check-in: address, confirmation, how to pay (pay-at-hotel) and the ID to bring. */
export async function stayReminders(userId: string, now = new Date()): Promise<number> {
  let n = 0;
  const tomorrow = addDays(ksaDate(now), 1);
  for (const o of await listStays(userId)) {
    if (o.status !== "confirmed" || o.hotel.checkIn !== tomorrow) continue;
    const id = `stay:checkin:${o.id}`;
    if (await store().get("notifications", id)) continue;
    await notify(userId, {
      id, userId, kind: "arrival", bookingId: "", reference: o.reference, createdAt: now.toISOString(), href: `/account/stays/${o.id}`, readAt: null, deletedAt: null, email: null,
      titleAr: `الوصول إلى ${o.hotel.nameAr} غدًا`, titleEn: `Check-in at ${o.hotel.nameEn} tomorrow`,
      linesAr: [`${o.hotel.districtAr} · رقم التأكيد ${o.confirmation}`, o.pay === "hotel" ? `ادفع ${o.totalSAR} ريال في الفندق عند الوصول.` : "الحجز مدفوع.", "أحضر جواز السفر أو الهوية الوطنية أو الإقامة لكل ضيف."],
      linesEn: [`${o.hotel.districtEn} · confirmation ${o.confirmation}`, o.pay === "hotel" ? `Pay SAR ${o.totalSAR} at the hotel on arrival.` : "The booking is paid.", "Bring each guest's passport, national ID or iqama."],
    });
    n++;
  }
  return n;
}
