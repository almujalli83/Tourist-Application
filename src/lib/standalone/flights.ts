/**
 * Flights booked without a tourism package: domestic flights, and international flights to or from
 * the Kingdom (one way, return, a stopover of up to 96 hours with Saudia or flynas, or a multi-city
 * trip of up to five flights). Offers come from every agent, signed by the server; the agent issues
 * one e-ticket per passenger per flight. All the flights are issued or none.
 */
import { randomBytes } from "node:crypto";
import { searchFlights } from "../agents/aggregator";
import { verifyOffer } from "../agents/offer-signing";
import { AgentBookingError } from "../agents/provider";
import { AGENTS } from "../agents/registry";
import type { PublicUser } from "../auth/types";
import { EMAIL_RE } from "../auth/validation";
import { COUNTRIES } from "../data/countries";
import { getCity, getSaudiCity, ORIGIN_CITIES } from "../data/cities";
import { addDays, addMonths, ageOn, isValidISODate } from "../dates";
import { awardPurchase, ksaDate, ksaDayStart, quietly, reversePurchase } from "../loyalty/loyalty";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { validatePhone } from "../phone";
import { priceFlightOffer } from "../pricing";
import type { AppNotification } from "../reminders/reminders";
import { getUserById } from "../repo";
import { getSavedTraveller } from "../saved-travellers-repo";
import { store } from "../store";
import { resolvePassenger } from "../trains/orders";
import type { CabinClass, FlightOffer, LegKind, PaxCount } from "../types";
import { docTypesFor, isEntryType, stopoverProblem, validDocNo, type DocType, type EntryType } from "./entry";
import type { FlightOrder, FlightPassenger, TripType } from "./types";

export class FlightError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

/** A failure tied to one flight of the booking (the page asks for another flight on that route). */
export class FlightLegError extends FlightError {
  constructor(code: string, status: number, public leg: number) {
    super(code, status);
  }
}

type Stored = FlightOrder & { userId: string };
export const MAX_TRIP_FLIGHTS = 5;
const COL = "flightOrders" as const;
/** Online sales close this long before departure. */
export const SALES_CLOSE_MIN = 180;
export const MAX_PASSENGERS = 9;
const CABINS: CabinClass[] = ["economy", "premium", "business", "first"];
const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.iso2));
const round2 = (n: number) => Math.round(n * 100) / 100;
const strip = ({ userId: _u, ...o }: Stored): FlightOrder => o; // eslint-disable-line @typescript-eslint/no-unused-vars
const unsigned = ({ sig: _s, expiresAt: _e, ...o }: FlightOffer) => o; // eslint-disable-line @typescript-eslint/no-unused-vars
const mask = (p: string) => (p.length > 4 ? `${"•".repeat(p.length - 4)}${p.slice(-4)}` : p);
/** Local times are those of the airport; flights to and from the Kingdom are compared in Saudi time. */
const ksaMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00+03:00`);

/** Airports flights can use: Saudi airports and the international cities served. */
const isSaudi = (code: string) => !!getSaudiCity(code);
const isAbroad = (code: string) => ORIGIN_CITIES.some((c) => c.code === code);
export const internationalCities = () => ORIGIN_CITIES.map((c) => c.code);

export function legKind(from: string, to: string): LegKind | null {
  if (from === to) return null;
  if (isSaudi(from) && isSaudi(to)) return "domestic";
  if (isAbroad(from) && isSaudi(to)) return "outbound";
  if (isSaudi(from) && isAbroad(to)) return "return";
  return null;
}

export interface FlightSearch { from: string; to: string; date: string; pax: PaxCount; cabin: CabinClass }

export function validatePax(p: Partial<PaxCount>): PaxCount {
  const pax = { adults: Number(p.adults), children: Number(p.children ?? 0), infants: Number(p.infants ?? 0) };
  if (![pax.adults, pax.children, pax.infants].every(Number.isInteger) || pax.adults < 1 || pax.children < 0 || pax.infants < 0) throw new FlightError("pax");
  if (pax.infants > pax.adults || pax.adults + pax.children + pax.infants > MAX_PASSENGERS) throw new FlightError("pax");
  return pax;
}

/** One flight leg from every agent, cheapest first; flights leaving within 3 hours are not sold. */
export async function searchStandaloneFlights(q: Partial<FlightSearch>, now = new Date()) {
  const from = String(q.from ?? "");
  const to = String(q.to ?? "");
  const kind = legKind(from, to);
  if (!kind) throw new FlightError("route");
  const date = String(q.date ?? "");
  if (!isValidISODate(date) || date < ksaDate(now) || date > addDays(ksaDate(now), 330)) throw new FlightError("date");
  const cabin = CABINS.includes(q.cabin as CabinClass) ? (q.cabin as CabinClass) : "economy";
  const pax = validatePax(q.pax ?? {});
  const res = await searchFlights({ leg: { index: 0, kind, from, to, date }, pax, cabin });
  return { ...res, offers: res.offers.filter((o) => ksaMs(o.departAt) - now.getTime() > SALES_CLOSE_MIN * 60_000), kind };
}

/* ---------------------------------------------------------------- passengers */

export interface FlightPassengerInput {
  type?: string;
  ref?: string;
  nameEn?: string;
  nationality?: string;
  docType?: string;
  docNo?: string;
  birthDate?: string;
  passportExpiry?: string;
}

type Resolved = FlightPassenger & { docNo: string; passportExpiry: string | null };

/** Age rules at the first departure: infants under 2, children 2–11, adults 12+. */
export function paxTypeOk(type: FlightPassenger["type"], birthDate: string, on: string): boolean {
  const age = ageOn(birthDate, on);
  if (!(age >= 0)) return false;
  return type === "infant" ? age < 2 : type === "child" ? age >= 2 && age <= 11 : age >= 12;
}

async function resolveFlightPassenger(userId: string, p: FlightPassengerInput, domestic: boolean, firstDate: string): Promise<Resolved> {
  const type = p.type === "adult" || p.type === "child" || p.type === "infant" ? p.type : null;
  if (!type) throw new FlightError("invalidPassenger");
  let nameEn = "";
  let nationality = "";
  let docNo = "";
  let docType: DocType = p.docType === "nationalId" || p.docType === "iqama" ? p.docType : "passport";
  let birthDate = String(p.birthDate ?? "");
  let passportExpiry: string | null = p.passportExpiry && isValidISODate(p.passportExpiry) ? p.passportExpiry : null;
  if (p.ref?.startsWith("saved:")) {
    const s = await getSavedTraveller(userId, p.ref.slice(6));
    if (!s) throw new FlightError("invalidPassenger");
    nameEn = [s.firstNameEn, s.middleNameEn, s.grandFatherNameEn, s.familyNameEn].filter(Boolean).join(" ").toUpperCase();
    nationality = s.nationality;
    docNo = s.passportNo.toUpperCase();
    docType = "passport";
    birthDate = s.birthDate || birthDate;
    passportExpiry = s.passportExpiryDate || passportExpiry;
  } else if (p.ref?.startsWith("booking:")) {
    try {
      const r = await resolvePassenger(userId, { type: type === "infant" ? "child" : type, ref: p.ref });
      nameEn = r.nameEn;
      nationality = r.nationality;
      docNo = r.passportNo;
      docType = "passport";
    } catch {
      throw new FlightError("invalidPassenger");
    }
  } else {
    nameEn = String(p.nameEn ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    nationality = String(p.nationality ?? "").trim().toUpperCase();
    docNo = String(p.docNo ?? "").replace(/\s/g, "").toUpperCase();
  }
  if (!/^[A-Z][A-Z' -]{1,59}$/.test(nameEn) || !nameEn.includes(" ")) throw new FlightError("invalidPassenger");
  if (!COUNTRY_CODES.has(nationality)) throw new FlightError("invalidPassenger");
  if (!docTypesFor(domestic).includes(docType)) throw new FlightError("passportRequired");
  if (!validDocNo(docType, docNo, nationality)) throw new FlightError("invalidDocument");
  if (!isValidISODate(birthDate) || !paxTypeOk(type, birthDate, firstDate)) throw new FlightError("birthDate");
  // International flights: a passport valid at least six months after the first flight.
  if (!domestic) {
    if (!passportExpiry) throw new FlightError("passportExpiry");
    if (passportExpiry < addMonths(firstDate, 6)) throw new FlightError("passportValidity");
  }
  return { nameEn, type, nationality, docType, docMasked: mask(docNo), docNo, birthDate, passportExpiry };
}

/* ---------------------------------------------------------------- booking */

export interface FlightBookingInput {
  entry?: string;
  tripType?: string;
  offers?: FlightOffer[];
  passengers?: FlightPassengerInput[];
  contact?: { email?: string; phone?: string };
  expectedTotalSAR?: number;
  card?: CardInput;
}

const agentOf = (id: string) => {
  const a = AGENTS.find((x) => x.id === id);
  if (!a) throw new FlightError("agentUnavailable", 502);
  return a;
};

/** Checks the flights chosen for a trip type (order, connections, stopover rules). */
export function checkItinerary(tripType: TripType, offers: FlightOffer[], entry: EntryType, now = new Date()): "domestic" | "international" {
  const kinds = offers.map((o) => legKind(o.from, o.to));
  if (kinds.some((k) => !k)) throw new FlightError("route");
  if (ksaMs(offers[0].departAt) - now.getTime() <= SALES_CLOSE_MIN * 60_000) throw new FlightError("salesClosed", 409);
  const [a, b] = offers;
  const gapOk = (x: FlightOffer, y: FlightOffer) => ksaMs(y.departAt) - ksaMs(x.arriveAt) >= 2 * 3_600_000;
  if (tripType === "multicity") {
    // Two to five flights, each touching the Kingdom, in time order with two hours to connect.
    if (offers.length < 2 || offers.length > MAX_TRIP_FLIGHTS) throw new FlightError("itinerary");
    for (let i = 1; i < offers.length; i++) if (!gapOk(offers[i - 1], offers[i])) throw new FlightLegError("itinerary", 422, i);
    if (entry === "stopover") throw new FlightError("stopoverEntry");
    return kinds.every((k) => k === "domestic") ? "domestic" : "international";
  } else if (tripType === "oneway") {
    if (offers.length !== 1) throw new FlightError("itinerary");
  } else if (tripType === "return") {
    if (offers.length !== 2 || b.from !== a.to || b.to !== a.from || !gapOk(a, b)) throw new FlightError("itinerary");
  } else {
    // Stopover: into the Kingdom from abroad, then on to another country from the same city.
    if (offers.length !== 2 || kinds[0] !== "outbound" || kinds[1] !== "return" || b.from !== a.to) throw new FlightError("itinerary");
    const problem = stopoverProblem(a, b);
    if (problem) throw new FlightError(problem);
  }
  if ((entry === "stopover") !== (tripType === "stopover")) throw new FlightError("stopoverEntry");
  if (kinds.every((k) => k === "domestic")) return "domestic";
  // One booking is either domestic or international (a domestic connection is booked separately).
  if (kinds.some((k) => k === "domestic")) throw new FlightError("itinerary");
  return "international";
}

export async function bookFlights(user: PublicUser, input: FlightBookingInput, now = new Date()): Promise<FlightOrder> {
  if (!isEntryType(input.entry)) throw new FlightError("entry");
  const entry = input.entry;
  const tripType = (["oneway", "return", "stopover", "multicity"] as const).find((x) => x === input.tripType);
  if (!tripType) throw new FlightError("itinerary");
  const offers = Array.isArray(input.offers) ? input.offers : [];
  if (!offers.length || offers.length > (tripType === "multicity" ? MAX_TRIP_FLIGHTS : 2)) throw new FlightError("itinerary");
  const expired = offers.findIndex((o) => !verifyOffer(o));
  if (expired >= 0) throw new FlightLegError("offerExpired", 409, expired);
  const scope = checkItinerary(tripType, offers, entry, now);
  const list = Array.isArray(input.passengers) ? input.passengers : [];
  const pax = validatePax({
    adults: list.filter((p) => p.type === "adult").length, children: list.filter((p) => p.type === "child").length, infants: list.filter((p) => p.type === "infant").length,
  });
  if (pax.adults + pax.children + pax.infants !== list.length) throw new FlightError("invalidPassenger");
  const firstDate = offers[0].departAt.slice(0, 10);
  const passengers = await Promise.all(list.map((p) => resolveFlightPassenger(user.id, p, scope === "domestic", firstDate)));
  if (new Set(passengers.map((p) => `${p.docType}:${p.docMasked}:${p.nameEn}`)).size !== passengers.length) throw new FlightError("duplicatePassenger");
  const email = String(input.contact?.email ?? "").trim().toLowerCase();
  const phone = String(input.contact?.phone ?? "").replace(/[\s-]/g, "");
  if (!EMAIL_RE.test(email)) throw new FlightError("email");
  if (validatePhone(phone)) throw new FlightError("phone");
  const prices = offers.map((o) => priceFlightOffer(o.fare, pax));
  const total = round2(prices.reduce((x, y) => x + y, 0));
  if (Math.abs(total - Number(input.expectedTotalSAR)) > 0.01) throw new FlightError("priceChanged", 409);
  if (!input.card) throw new FlightError("invalid_card");
  const paid = await chargeCard(input.card, total, now);
  if (!paid.ok) throw new FlightError(paid.code, 402);
  const id = randomBytes(10).toString("hex");
  const reference = `FL-${randomBytes(3).toString("hex").toUpperCase()}`;
  const issued: { pnr: string; tickets: string[] }[] = [];
  for (const o of offers) {
    try {
      issued.push(await agentOf(o.agentId).issueFlight({
        offer: o, reference, contact: { email, phone },
        passengers: passengers.map((p) => ({ nameEn: p.nameEn, type: p.type, nationality: p.nationality, docType: p.docType, docNo: p.docNo, birthDate: p.birthDate })),
      }));
    } catch (e) {
      // All or nothing: void the tickets already issued and return the money; name the flight that failed.
      for (let i = 0; i < issued.length; i++) await agentOf(offers[i].agentId).cancelFlight(issued[i].pnr).catch(() => undefined);
      await refundPayment(paid.transactionId, total);
      throw new FlightLegError(e instanceof AgentBookingError && e.code === "rejected" ? "agentRejected" : e instanceof FlightError ? e.code : "agentUnavailable", 502, issued.length);
    }
  }
  const order: Stored = {
    id, userId: user.id, reference, entry, tripType, scope,
    segments: offers.map((o, i) => ({ offer: unsigned(o), pnr: issued[i].pnr, tickets: issued[i].tickets, priceSAR: prices[i] })),
    passengers: passengers.map(({ nameEn, type, nationality, docType, docMasked, birthDate }) => ({ nameEn, type, nationality, docType, docMasked, birthDate })),
    contact: { email, phone }, totalSAR: total, status: "confirmed",
    payment: { transactionId: paid.transactionId, method: paid.method, last4: paid.last4, amountSAR: total, paidAt: now.toISOString() },
    cancellation: null, createdAt: now.toISOString(),
    ...(offers.some((o) => agentOf(o.agentId).sandbox) ? { sandbox: true } : {}),
  };
  const last = offers[offers.length - 1];
  const earned = await quietly("flight points", () => awardPurchase(user, {
    service: "flight", source: { kind: "flight", id, reference }, eligibleSAR: total, availableAt: ksaDayStart(addDays(last.arriveAt.slice(0, 10), 1)),
    cities: offers.flatMap((o) => [o.from, o.to]).filter(isSaudi),
  }, now), 0);
  if (earned) order.loyalty = { earnedPoints: earned };
  await store().put(COL, id, order);
  const line = (o: FlightOffer, i: number) => `${o.flightNo} ${o.from} → ${o.to} ${o.departAt.replace("T", " ")} — PNR ${issued[i].pnr}`;
  await notifyTravellers([...new Set([user.email, email])], {
    subject: `Saudi Trip — e-tickets ${offers.map((o) => `${o.from}-${o.to}`).join(", ")} (${reference})`,
    text: [
      ...offers.map(line),
      ...passengers.map((p, i) => `${p.nameEn}: ${order.segments.map((s) => s.tickets[i]).join(", ")}`),
      "", "التذاكر الإلكترونية في «حجوزاتي» — احضر إلى المطار مبكرًا مع وثيقة السفر المسجلة في الحجز.",
    ].join("\n"),
  }).catch(() => undefined);
  return strip(order);
}

export async function listFlightOrders(userId: string): Promise<FlightOrder[]> {
  return (await store().findBy<Stored>(COL, "userId", userId)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getFlightOrder(userId: string, id: string): Promise<FlightOrder | null> {
  const o = await store().get<Stored>(COL, id);
  return o && o.userId === userId ? strip(o) : null;
}

const active = (o: FlightOrder) => o.segments.filter((s) => !s.cancellation);

/** Until 3 hours before the first remaining flight: refundable fares are refunded in full, others not at all. */
export function flightCancelTerms(o: FlightOrder, now = new Date()): { allowed: boolean; refundSAR: number } {
  const left = active(o);
  if (o.status !== "confirmed" || !left.length || ksaMs(left[0].offer.departAt) - now.getTime() <= SALES_CLOSE_MIN * 60_000) return { allowed: false, refundSAR: 0 };
  return { allowed: true, refundSAR: round2(left.filter((s) => s.offer.refundable).reduce((a, s) => a + s.priceSAR, 0)) };
}

/** One flight of a multi-city trip, until 3 hours before it: its own fare back when refundable. */
export function segmentCancelTerms(o: FlightOrder, index: number, now = new Date()): { allowed: boolean; refundSAR: number } {
  const s = o.segments[index];
  if (o.status !== "confirmed" || o.tripType !== "multicity" || !s || s.cancellation || ksaMs(s.offer.departAt) - now.getTime() <= SALES_CLOSE_MIN * 60_000) return { allowed: false, refundSAR: 0 };
  return { allowed: true, refundSAR: s.offer.refundable ? s.priceSAR : 0 };
}

/** Cancels one flight of a multi-city trip; the others keep their tickets. The last one cancels the booking. */
export async function cancelFlightSegment(user: PublicUser, id: string, index: number, now = new Date()): Promise<FlightOrder> {
  const o = await store().get<Stored>(COL, id);
  if (!o || o.userId !== user.id) throw new FlightError("notFound", 404);
  const terms = segmentCancelTerms(o, index, now);
  if (!terms.allowed) throw new FlightError("cannotCancel", 409);
  const s = o.segments[index];
  try {
    await agentOf(s.offer.agentId).cancelFlight(s.pnr);
  } catch {
    throw new FlightError("agentUnavailable", 502);
  }
  if (terms.refundSAR > 0) {
    await refundPayment(o.payment.transactionId, terms.refundSAR);
    await quietly("flight points reversal", () => reversePurchase(user.id, [o.id], terms.refundSAR / o.payment.amountSAR, now), 0);
  }
  const at = now.toISOString();
  const done = await store().update<Stored>(COL, id, (x) => {
    const segments = x.segments.map((sg, i) => (i === index ? { ...sg, cancellation: { at, refundSAR: terms.refundSAR } } : sg));
    const refunded = round2(segments.reduce((a, sg) => a + (sg.cancellation?.refundSAR ?? 0), 0));
    return { ...x, segments, ...(segments.every((sg) => sg.cancellation) ? { status: "cancelled" as const, cancellation: { at, refundSAR: refunded } } : {}) };
  });
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — flight ${s.offer.flightNo} cancelled (${o.reference})`,
    text: [
      `${s.offer.flightNo} ${s.offer.from} → ${s.offer.to} ${s.offer.departAt.replace("T", " ")}: cancelled.${terms.refundSAR ? ` SAR ${terms.refundSAR} will be refunded to your card.` : " The fare was non-refundable."} Your other flights are unchanged.`,
      `${s.offer.flightNo} ${s.offer.from} ← ${s.offer.to}: أُلغيت الرحلة.${terms.refundSAR ? ` سيُعاد ${terms.refundSAR} ريال إلى بطاقتك.` : " السعر غير قابل للاسترداد."} بقية رحلاتك دون تغيير.`,
    ].join("\n"),
  }).catch(() => undefined);
  return strip(done!);
}

export async function cancelFlightOrder(user: PublicUser, id: string, now = new Date()): Promise<FlightOrder> {
  const o = await store().get<Stored>(COL, id);
  if (!o || o.userId !== user.id) throw new FlightError("notFound", 404);
  const terms = flightCancelTerms(o, now);
  if (!terms.allowed) throw new FlightError("cannotCancel", 409);
  try {
    for (const s of active(o)) await agentOf(s.offer.agentId).cancelFlight(s.pnr);
  } catch {
    throw new FlightError("agentUnavailable", 502);
  }
  if (terms.refundSAR > 0) {
    await refundPayment(o.payment.transactionId, terms.refundSAR);
    await quietly("flight points reversal", () => reversePurchase(user.id, [o.id], terms.refundSAR / o.payment.amountSAR, now), 0);
  }
  const at = now.toISOString();
  const done = await store().update<Stored>(COL, id, (x) => ({
    ...x, status: "cancelled", cancellation: { at, refundSAR: round2(terms.refundSAR + x.segments.reduce((a, sg) => a + (sg.cancellation?.refundSAR ?? 0), 0)) },
  }));
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — flights cancelled (${o.reference})`,
    text: [`Your tickets were cancelled.${terms.refundSAR ? ` SAR ${terms.refundSAR} will be refunded to your card.` : " The fares were non-refundable."}`, `أُلغيت تذاكرك.${terms.refundSAR ? ` سيُعاد ${terms.refundSAR} ريال إلى بطاقتك.` : " الأسعار غير قابلة للاسترداد."}`].join("\n"),
  }).catch(() => undefined);
  return strip(done!);
}

/* ---------------------------------------------------------------- reminders */

const DOCS_AR: Record<EntryType, string> = {
  evisa: "احمل التأشيرة السياحية الإلكترونية (مطبوعة أو على الجوال) مع جواز السفر.",
  arrival: "تُصدر التأشيرة عند الوصول في المطار: احمل جواز السفر وحجز الفندق وتذكرة العودة.",
  stopover: "تأشيرة التوقف تصدر مع تذكرة الطيران: تحقق من رسالة شركة الطيران واحمل جواز السفر.",
  gcc: "احمل الهوية الوطنية لدول الخليج أو جواز السفر.",
  resident: "احمل الإقامة (وتأشيرة الخروج والعودة عند السفر إلى الخارج).",
  citizen: "احمل الهوية الوطنية أو جواز السفر.",
};
const DOCS_EN: Record<EntryType, string> = {
  evisa: "Carry your tourist eVisa (printed or on your phone) with your passport.",
  arrival: "Your visa is issued on arrival at the airport: carry your passport, hotel booking and onward ticket.",
  stopover: "The stopover visa comes with your ticket: check the airline's email and carry your passport.",
  gcc: "Carry your GCC national ID or passport.",
  resident: "Carry your iqama (and an exit/re-entry visa when flying abroad).",
  citizen: "Carry your national ID or passport.",
};

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }).catch(() => undefined);
}

/** A day before each flight: airport, when to be there, and the travel documents for the entry type. */
export async function flightReminders(userId: string, now = new Date()): Promise<number> {
  let n = 0;
  for (const o of await listFlightOrders(userId)) {
    if (o.status !== "confirmed") continue;
    for (const [i, s] of o.segments.entries()) {
      if (s.cancellation) continue;
      const toDep = ksaMs(s.offer.departAt) - now.getTime();
      if (toDep <= 0 || toDep > 26 * 3_600_000) continue;
      const id = `flight:${o.id}:${i}`;
      if (await store().get("notifications", id)) continue;
      const domestic = legKind(s.offer.from, s.offer.to) === "domestic";
      const before = domestic ? 2 : 3;
      const from = getCity(s.offer.from);
      await notify(userId, {
        id, userId, kind: legKind(s.offer.from, s.offer.to) === "outbound" ? "arrival" : "departure", bookingId: "", reference: o.reference, createdAt: now.toISOString(),
        href: `/account/flights/${o.id}`, readAt: null, deletedAt: null, email: null,
        titleAr: `رحلة ${s.offer.flightNo} ${s.offer.from} ← ${s.offer.to} — ${s.offer.departAt.replace("T", " ")}`,
        titleEn: `Flight ${s.offer.flightNo} ${s.offer.from} → ${s.offer.to} — ${s.offer.departAt.replace("T", " ")}`,
        linesAr: [`من ${from?.airportAr ?? s.offer.from} · الحجز ${s.pnr}`, `كن في المطار قبل ${before} ساعات من الإقلاع.`, DOCS_AR[o.entry]],
        linesEn: [`From ${from?.airportEn ?? s.offer.from} · PNR ${s.pnr}`, `Be at the airport ${before} hours before take-off.`, DOCS_EN[o.entry]],
      });
      n++;
    }
  }
  return n;
}
