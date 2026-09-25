/**
 * Package update (service 2): after purchase, extend the package (extra nights in the last city
 * or in a new city, reached by domestic flight, car or train) or shorten it (cancel the last
 * nights), always moving the return flight. Changes to booked services go through the agent that
 * booked them; cancellations follow each service's refund policy; MT is updated per applicant
 * with updateTravellerTravelDetails (§8).
 */
import { randomInt, randomUUID } from "node:crypto";
import {
  AgentRejectedError, confirmAgentChanges, flightChangeFee, hotelPaxKey, quoteHotelExtension, releaseAgentChanges,
  requestAgentChanges, searchFlights, searchHotels,
} from "../agents/aggregator";
import { verifyOffer } from "../agents/offer-signing";
import type { PublicUser } from "../auth/types";
import { PACKAGE_LIMITS } from "../config";
import { addDays, diffDays, isValidISODate } from "../dates";
import { cityName, getSaudiCity } from "../data/cities";
import { stayDates } from "../itinerary";
import { getMtClient, mtIsOk } from "../mt-evisa/client";
import { buildUpdateRequests } from "../mt-evisa/mapper";
import { adultsOf } from "../occupancy";
import { minimumPackagePrice } from "../package-rules";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { computePackagePrice, type PriceBreakdown } from "../pricing";
import { notifyTravellers } from "../notify";
import { getBookingForUser, getUserById, updateBooking } from "../repo";
import type { ActivityOffer, CityStay, FlightOffer, HotelOffer, SearchCriteria } from "../types";
import { BookingError } from "./service";
import type { BookingModification, ModificationKind, ModificationLine, StoredBooking, TransportMode } from "./types";

/** Changes are accepted until this many hours before the booked return flight. */
export const MODIFY_CUTOFF_HOURS = 48;
/** Minimum notice for a new (earlier) return date, in days. */
const MIN_NOTICE_DAYS = 2;

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Flight times are local Saudi time (UTC+3). */
const ksaTime = (localDateTime: string) => Date.parse(`${localDateTime}:00+03:00`);
const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

export function returnFlightOf(b: Pick<StoredBooking, "flights">): FlightOffer {
  return b.flights.find((f) => f.kind === "return")!;
}

export interface Eligibility {
  allowed: boolean;
  reason: null | "cancelled" | "noPackage" | "visaNotIssued" | "tooLate";
  /** Last moment a change can be made (ISO). */
  deadline: string;
  currentReturnDate: string;
  /** Earliest new return date when shortening. */
  minReturnDate: string;
  /** Latest new return date when extending (visa expiry / maximum package duration). */
  maxReturnDate: string;
  visaExpiryDate: string | null;
  lastCity: string;
  origin: string;
}

export function modificationEligibility(b: StoredBooking, now = new Date()): Eligibility {
  const ret = returnFlightOf(b);
  const c = b.criteria;
  const deadline = new Date(ksaTime(ret.departAt) - MODIFY_CUTOFF_HOURS * 3600_000).toISOString();
  const expiries = b.applicants.map((a) => a.visaExpiryDate).filter((d): d is string => !!d && isValidISODate(d)).sort();
  const visaExpiryDate = expiries[0] ?? null;
  const maxByDuration = addDays(c.departureDate, PACKAGE_LIMITS.maxPackageDays);
  const maxReturnDate = visaExpiryDate && visaExpiryDate < maxByDuration ? visaExpiryDate : maxByDuration;
  const byDuration = addDays(c.departureDate, PACKAGE_LIMITS.minPackageDays);
  const byNotice = addDays(ksaToday(now), MIN_NOTICE_DAYS);
  const base = {
    deadline,
    currentReturnDate: c.returnDate,
    minReturnDate: byDuration > byNotice ? byDuration : byNotice,
    maxReturnDate,
    visaExpiryDate,
    lastCity: c.stays[c.stays.length - 1].city,
    origin: c.origin,
  };
  const reason: Eligibility["reason"] =
    b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED"
      ? "cancelled"
      : !b.mt.packageId
        ? "noPackage"
        : !b.applicants.length || b.applicants.some((a) => !a.visaNumber || !a.visaExpiryDate)
          ? "visaNotIssued"
          : now.toISOString() > deadline
            ? "tooLate"
            : null;
  return { ...base, allowed: reason === null, reason };
}

/* ------------------------------------------------------------------ plan */

export interface ModificationTarget {
  mode: "lastCity" | "newCity";
  city?: string;
  transport?: TransportMode;
}

/** What the customer chose; offers are the signed offers returned by `modificationOptions`. */
export interface ModificationPlan {
  newReturnDate: string;
  target?: ModificationTarget;
  offers: { returnFlight?: FlightOffer; hotel?: HotelOffer; domesticFlight?: FlightOffer };
}

function kindOf(b: StoredBooking, newReturnDate: string): ModificationKind {
  return newReturnDate > b.criteria.returnDate ? "extend" : "shorten";
}

function checkDate(b: StoredBooking, el: Eligibility, newReturnDate: string) {
  if (!isValidISODate(newReturnDate) || newReturnDate === b.criteria.returnDate) throw new BookingError("invalidDate");
  if (newReturnDate > b.criteria.returnDate && newReturnDate > el.maxReturnDate) throw new BookingError("beyondVisa", el.maxReturnDate);
  if (newReturnDate < b.criteria.returnDate && newReturnDate < el.minReturnDate) throw new BookingError("tooShort", el.minReturnDate);
}

/** Resolves the city the traveller stays in last and leaves from after the change. */
function resolveTarget(b: StoredBooking, kind: ModificationKind, newReturnDate: string, target?: ModificationTarget) {
  const lastCity = b.criteria.stays[b.criteria.stays.length - 1].city;
  if (kind === "shorten") {
    const kept = stayDates(b.criteria).filter((s) => s.checkIn < newReturnDate);
    return { mode: null, departureCity: kept[kept.length - 1].city, lastCity, city: null, transport: null };
  }
  if (!target || target.mode === "lastCity") return { mode: "lastCity" as const, departureCity: lastCity, lastCity, city: lastCity, transport: null };
  const city = target.city ?? "";
  if (!getSaudiCity(city) || city === lastCity) throw new BookingError("invalidCity");
  const transport = target.transport ?? "flight";
  if (!["flight", "car", "train"].includes(transport)) throw new BookingError("invalidTransport");
  return { mode: "newCity" as const, departureCity: city, lastCity, city, transport };
}

/** Offers the customer can choose from for a new return date (and extension target). */
export async function modificationOptions(b: StoredBooking, input: { newReturnDate: string; target?: ModificationTarget }, now = new Date()) {
  const el = modificationEligibility(b, now);
  if (!el.allowed) throw new BookingError(el.reason ?? "notAllowed");
  checkDate(b, el, input.newReturnDate);
  const kind = kindOf(b, input.newReturnDate);
  const t = resolveTarget(b, kind, input.newReturnDate, input.target);
  const c = b.criteria;
  const ret = returnFlightOf(b);
  const addsLeg = kind === "extend" && t.mode === "newCity" && t.transport === "flight";

  // The return ticket is changed by the agent that issued it.
  const returnFlights = searchFlights(
    { leg: { index: ret.legIndex + (addsLeg ? 1 : 0), kind: "return", from: t.departureCity, to: c.origin, date: input.newReturnDate }, pax: c.pax, cabin: c.cabin },
    [ret.agentId],
  );
  let hotels: Promise<HotelOffer[]> = Promise.resolve([]);
  let domesticFlights: Promise<FlightOffer[]> = Promise.resolve([]);
  if (kind === "extend") {
    const stay = { checkIn: c.returnDate, checkOut: input.newReturnDate, pax: c.pax, rooms: c.rooms };
    const lastHotel = b.hotels.find((h) => h.city === t.lastCity && h.checkOut === c.returnDate);
    const same = t.mode === "lastCity" && lastHotel ? quoteHotelExtension(lastHotel, input.newReturnDate) : Promise.resolve(null);
    const others = searchHotels({ city: t.city!, ...stay }).then((r) => r.offers);
    hotels = Promise.all([same, others]).then(([s, o]) => (s ? [s, ...o] : o));
    if (addsLeg)
      domesticFlights = searchFlights({ leg: { index: ret.legIndex, kind: "domestic", from: t.lastCity, to: t.city!, date: c.returnDate }, pax: c.pax, cabin: c.cabin }).then((r) => r.offers);
  }
  const [r, h, d] = await Promise.all([returnFlights, hotels, domesticFlights]);
  return { kind, eligibility: el, departureCity: t.departureCity, returnFlights: r.offers, hotels: h, domesticFlights: d };
}

export interface ModificationQuote {
  /** Version of the booking the quote was priced on (a change applies only to that version). */
  bookingVersion: number;
  kind: ModificationKind;
  newReturnDate: string;
  target: BookingModification["target"];
  lines: ModificationLine[];
  /** Net amount to charge (positive) or refund, in SAR. */
  chargeSAR: number;
  refundSAR: number;
  previousTotalSAR: number;
  newTotalSAR: number;
  newDurationDays: number;
  /** The package after the change (not yet saved). */
  next: { criteria: SearchCriteria; flights: FlightOffer[]; hotels: HotelOffer[]; activities: ActivityOffer[]; price: PriceBreakdown; ticketNos: string[] };
}

const agentOf = (o: { agentId: string; agentNameEn: string; agentNameAr: string } | null) =>
  o ? { agentId: o.agentId, agentNameEn: o.agentNameEn, agentNameAr: o.agentNameAr } : { agentId: null, agentNameEn: null, agentNameAr: null };
const hotelLabel = (h: HotelOffer) => ({ labelEn: `${h.nameEn} — ${cityName(h.city, "en")}`, labelAr: `${h.nameAr} — ${cityName(h.city, "ar")}` });
const flightLabel = (f: FlightOffer) => ({
  labelEn: `${f.flightNo} ${cityName(f.from, "en")} → ${cityName(f.to, "en")} ${f.departAt.replace("T", " ")}`,
  labelAr: `${f.flightNo} ${cityName(f.from, "ar")} ← ${cityName(f.to, "ar")} ${f.departAt.replace("T", " ")}`,
});
const ticketNo = () => `ETKT${randomInt(100000, 999999)}${randomInt(1000, 9999)}`;

/**
 * Prices a plan against the booking: validates the signed offers and applies the refund /
 * change policies of each service. Pure apart from reading the booking.
 */
export function quoteModification(b: StoredBooking, plan: ModificationPlan, now = new Date()): ModificationQuote {
  const el = modificationEligibility(b, now);
  if (!el.allowed) throw new BookingError(el.reason ?? "notAllowed");
  checkDate(b, el, plan.newReturnDate);
  const kind = kindOf(b, plan.newReturnDate);
  const t = resolveTarget(b, kind, plan.newReturnDate, plan.target);
  const c = b.criteria;
  const oldRet = returnFlightOf(b);
  const newReturnDate = plan.newReturnDate;
  const lines: ModificationLine[] = [];
  const ticketNos = b.ticketNos ?? b.flights.map(() => ticketNo());

  let flights = b.flights.map((f, i) => ({ f, ticket: ticketNos[i] })).filter(({ f }) => f.kind !== "return");
  let hotels = b.hotels.map((h) => ({ ...h }));
  let activities = [...b.activities];
  let stays: CityStay[] = c.stays.map((s) => ({ ...s }));
  // Non-refundable amounts of cancelled services stay part of the package price.
  let retained = b.price.retainedSAR ?? 0;

  if (kind === "extend") {
    const extra = diffDays(c.returnDate, newReturnDate);
    const h = plan.offers.hotel;
    if (!h || !verifyOffer(h) || h.city !== t.city || h.checkIn !== c.returnDate || h.checkOut !== newReturnDate || h.forPax !== hotelPaxKey(c.pax, c.rooms))
      throw new BookingError("offerExpired");
    if (h.stars < PACKAGE_LIMITS.minHotelStars || !h.licenseNo) throw new BookingError("hotelNotAllowed");
    const last = hotels.find((x) => x.city === t.lastCity && x.checkOut === c.returnDate);
    if (h.id.startsWith("HX:")) {
      // Same hotel: extended with the agent that booked it.
      if (!last || h.agentId !== last.agentId || h.licenseNo !== last.licenseNo) throw new BookingError("offerExpired");
      last.checkOut = newReturnDate;
      last.nights += extra;
      last.totalSAR = round2(last.totalSAR + h.totalSAR);
      lines.push({ type: "hotelExtended", ...hotelLabel(h), ...agentOf(h), amountSAR: h.totalSAR, nonRefundableSAR: 0, detail: `+${extra}` });
    } else {
      hotels.push(h);
      lines.push({ type: "hotelAdded", ...hotelLabel(h), ...agentOf(h), amountSAR: h.totalSAR, nonRefundableSAR: 0, detail: `${h.checkIn} → ${h.checkOut}` });
    }
    if (t.mode === "newCity") {
      stays.push({ city: t.city!, nights: extra });
      if (t.transport === "flight") {
        const d = plan.offers.domesticFlight;
        if (!d || !verifyOffer(d) || d.kind !== "domestic" || d.from !== t.lastCity || d.to !== t.city || !d.departAt.startsWith(c.returnDate))
          throw new BookingError("offerExpired");
        flights.push({ f: { ...d, legIndex: flights.length }, ticket: ticketNo() });
        lines.push({ type: "flightAdded", ...flightLabel(d), ...agentOf(d), amountSAR: d.totalSAR, nonRefundableSAR: 0 });
      } else {
        const mode = t.transport === "car" ? { en: "By car", ar: "بالسيارة" } : { en: "By train", ar: "بالقطار" };
        lines.push({
          type: "transport",
          labelEn: `${mode.en}: ${cityName(t.lastCity, "en")} → ${cityName(t.city!, "en")} (${c.returnDate})`,
          labelAr: `${mode.ar}: ${cityName(t.lastCity, "ar")} ← ${cityName(t.city!, "ar")} (${c.returnDate})`,
          ...agentOf(null),
          amountSAR: 0,
          nonRefundableSAR: 0,
        });
      }
    } else {
      stays[stays.length - 1].nights += extra;
    }
  } else {
    // Shorten: cancel everything from the new return date, per each service's refund policy.
    const refundOrLose = (value: number, refundable: boolean | undefined, keptInLine = false) => {
      if (refundable) return { amountSAR: -round2(value), nonRefundableSAR: 0 };
      if (!keptInLine) retained += value;
      return { amountSAR: 0, nonRefundableSAR: round2(value) };
    };
    hotels = hotels.flatMap((h) => {
      if (h.checkIn >= newReturnDate) {
        lines.push({ type: "hotelCancelled", ...hotelLabel(h), ...agentOf(h), ...refundOrLose(h.totalSAR, h.refundable), detail: `${h.checkIn} → ${h.checkOut}` });
        return [];
      }
      if (h.checkOut > newReturnDate) {
        const cancelled = diffDays(newReturnDate, h.checkOut);
        const value = round2((h.totalSAR / h.nights) * cancelled);
        lines.push({ type: "hotelShortened", ...hotelLabel(h), ...agentOf(h), ...refundOrLose(value, h.refundable, true), detail: `-${cancelled}` });
        // A non-refundable stay keeps its full (paid) price.
        return [{ ...h, checkOut: newReturnDate, nights: h.nights - cancelled, totalSAR: h.refundable ? round2(h.totalSAR - value) : h.totalSAR }];
      }
      return [h];
    });
    flights = flights.filter(({ f }) => {
      if (f.kind !== "domestic" || f.departAt.slice(0, 10) < newReturnDate) return true;
      lines.push({ type: "flightCancelled", ...flightLabel(f), ...agentOf(f), ...refundOrLose(f.totalSAR, f.refundable) });
      return false;
    });
    activities = activities.filter((a) => {
      if (a.date < newReturnDate) return true;
      lines.push({ type: "activityCancelled", labelEn: `${a.titleEn} (${a.date})`, labelAr: `${a.titleAr} (${a.date})`, ...agentOf(a), ...refundOrLose(a.totalSAR, a.refundable) });
      return false;
    });
    const kept = stayDates(c).filter((s) => s.checkIn < newReturnDate);
    stays = kept.map((s) => ({ city: s.city, nights: diffDays(s.checkIn, s.checkOut < newReturnDate ? s.checkOut : newReturnDate) }));
  }

  // Return flight: changed by the issuing agent (fare difference + change fee per its policy).
  const r = plan.offers.returnFlight;
  if (!r || !verifyOffer(r) || r.kind !== "return" || r.agentId !== oldRet.agentId || r.from !== t.departureCity || r.to !== c.origin || !r.departAt.startsWith(newReturnDate))
    throw new BookingError("offerExpired");
  const fee = flightChangeFee(oldRet, c.pax);
  const diff = round2(r.totalSAR - oldRet.totalSAR);
  const lost = diff < 0 && !oldRet.refundable ? -diff : 0;
  retained += lost;
  lines.push({
    type: "flightChanged",
    ...flightLabel(r),
    ...agentOf(r),
    amountSAR: round2(fee + (lost ? 0 : diff)),
    nonRefundableSAR: round2(lost),
    detail: fee ? `fee:${fee}` : undefined,
  });
  flights.push({ f: { ...r, legIndex: flights.length }, ticket: ticketNo() });

  const newFlights = flights.map(({ f }) => f);
  const criteria: SearchCriteria = { ...c, stays, returnDate: newReturnDate };
  const price = computePackagePrice({ pax: c.pax, flights: newFlights, hotels, activities, visaFeeSAR: b.price.visaFeePerTravellerSAR, retainedSAR: round2(retained) });

  // Key package requirements still apply after the change.
  const days = diffDays(c.departureDate, newReturnDate);
  if (days < PACKAGE_LIMITS.minPackageDays || days > PACKAGE_LIMITS.maxPackageDays) throw new BookingError("duration");
  if (price.totalSAR < minimumPackagePrice(adultsOf(c.rooms))) throw new BookingError("minPrice", minimumPackagePrice(adultsOf(c.rooms)));

  const net = round2(lines.reduce((a, l) => a + l.amountSAR, 0));
  return {
    bookingVersion: b.version ?? 0,
    kind,
    newReturnDate,
    target: kind === "extend" ? { mode: t.mode!, city: t.city!, transport: t.transport } : null,
    lines,
    chargeSAR: net > 0 ? net : 0,
    refundSAR: net < 0 ? -net : 0,
    previousTotalSAR: b.price.totalSAR,
    newTotalSAR: price.totalSAR,
    newDurationDays: days,
    next: { criteria, flights: newFlights, hotels, activities, price, ticketNos: flights.map(({ ticket }) => ticket) },
  };
}

/* ------------------------------------------------------------- execution */

/** Sends the booking's current travel details to MT for the given applicants. */
async function pushToMt(b: StoredBooking, applicationNos: string[], requestInitiatedBy?: string) {
  const client = getMtClient();
  const messageId = randomUUID();
  const requests = await buildUpdateRequests(client, {
    packageId: b.mt.packageId!,
    messageId,
    applicants: b.applicants.filter((a) => applicationNos.includes(a.applicationNo)).map((a) => ({ applicationNo: a.applicationNo, paxType: a.paxType })),
    flights: b.flights,
    hotels: b.hotels,
    activities: b.activities,
    ticketNos: b.ticketNos ?? [],
    purchaseDate: b.createdAt.slice(0, 10),
    departureDate: b.criteria.departureDate,
    returnDate: b.criteria.returnDate,
    visaFeeSAR: b.price.visaFeePerTravellerSAR,
    retainedSAR: b.price.retainedSAR,
    requestInitiatedBy,
  });
  const results = await Promise.all(
    requests.map(async (req) => {
      try {
        const res = await client.updateTravellerTravelDetails(req);
        return { applicationNo: req.visitorData.applicationNo, ok: mtIsOk(res.errorCodes), errorCodes: mtIsOk(res.errorCodes) ? [] : res.errorCodes };
      } catch (err) {
        return { applicationNo: req.visitorData.applicationNo, ok: false, errorCodes: [(err as Error).message || "NETWORK"] };
      }
    }),
  );
  return { messageId, results };
}

const mtStatus = (results: { ok: boolean }[]): BookingModification["mt"]["status"] =>
  results.every((r) => r.ok) ? "UPDATED" : results.some((r) => r.ok) ? "PARTIAL" : "FAILED";

async function notifyIfUpdated(b: StoredBooking, m: BookingModification): Promise<BookingModification["notified"]> {
  if (m.mt.status !== "UPDATED" || m.notified) return m.notified;
  const emails = [...new Set(b.applicants.map((a) => a.email).filter(Boolean))];
  const kindAr = m.kind === "extend" ? "تمديد" : "تقليص";
  const entry = await notifyTravellers(
    emails,
    {
      subject: `Saudi Trip ${b.reference} — package updated / تم تحديث الباقة`,
      text: [
        `Booking ${b.reference}: your package was ${m.kind === "extend" ? "extended" : "shortened"}. New return date: ${m.newReturnDate} (was ${m.previousReturnDate}).`,
        `Your travel details were updated with the Ministry of Tourism; your visa remains valid until its expiry date.`,
        "",
        `الحجز ${b.reference}: تم ${kindAr} باقتك. تاريخ العودة الجديد: ${m.newReturnDate} (بدلًا من ${m.previousReturnDate}).`,
        `تم تحديث بيانات سفرك لدى وزارة السياحة، وتبقى تأشيرتك سارية حتى تاريخ انتهائها.`,
      ].join("\n"),
    },
    { bookingId: b.id },
  );
  return entry ? { emails: entry.to, at: entry.createdAt, delivered: entry.status === "sent" } : null;
}

const LOCK_TTL_MS = 2 * 60_000;

/** Takes the booking's change lock, checking it is still the version the quote was priced on. */
async function acquireLock(bookingId: string, expectedVersion: number, token: string, idempotencyKey: string) {
  let existing: BookingModification | undefined;
  const locked = await updateBooking(bookingId, (cur) => {
    existing = cur.modifications?.find((m) => m.idempotencyKey === idempotencyKey);
    if (existing) return cur;
    if (cur.lock && Date.now() - Date.parse(cur.lock.at) < LOCK_TTL_MS) throw new BookingError("inProgress");
    if ((cur.version ?? 0) !== expectedVersion) throw new BookingError("bookingChanged");
    return { ...cur, lock: { token, at: new Date().toISOString() } };
  });
  if (!locked) throw new BookingError("notFound");
  return { booking: locked, existing };
}

async function releaseLock(bookingId: string, token: string) {
  await updateBooking(bookingId, (cur) => (cur.lock?.token === token ? { ...cur, lock: null } : cur)).catch(() => undefined);
}

/**
 * Applies a package change, in order: agents' approval → payment (or refund) → agents' final
 * confirmation → MT update per applicant → saved change history → traveller email.
 * A request is applied once per idempotency key, only on the booking version it was priced on,
 * and never concurrently with another change of the same booking.
 */
export async function executeModification(
  user: PublicUser,
  bookingId: string,
  input: { plan: ModificationPlan; expectedChargeSAR: number; expectedRefundSAR: number; bookingVersion: number; idempotencyKey: string; card?: CardInput },
): Promise<{ booking: StoredBooking; modification: BookingModification; replayed: boolean }> {
  const owned = await getBookingForUser(user.id, bookingId);
  if (!owned) throw new BookingError("notFound");
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new BookingError("idempotencyKey");
  const token = randomUUID();
  const { booking: b, existing } = await acquireLock(bookingId, input.bookingVersion, token, input.idempotencyKey);
  if (existing) return { booking: b, modification: existing, replayed: true };

  let approvals: Awaited<ReturnType<typeof requestAgentChanges>> = [];
  let committed = false; // true once the customer has paid / the agents confirmed
  try {
    const q = quoteModification(b, input.plan);
    if (Math.abs(q.chargeSAR - input.expectedChargeSAR) > 0.009 || Math.abs(q.refundSAR - input.expectedRefundSAR) > 0.009)
      throw new BookingError("priceChanged", { chargeSAR: q.chargeSAR, refundSAR: q.refundSAR });
    if (q.chargeSAR > 0 && !input.card) throw new BookingError("cardRequired");

    // 1) The travel agents approve their part of the change first.
    try {
      approvals = await requestAgentChanges(b.reference, q.lines);
    } catch (err) {
      if (err instanceof AgentRejectedError) throw new BookingError("agentRejected", err.agents);
      throw err;
    }

    // 2) Payment of the difference (or refund to the original card).
    let payment: BookingModification["payment"] = null;
    if (q.chargeSAR > 0) {
      const p = await chargeCard(input.card!, q.chargeSAR);
      if (!p.ok) throw new BookingError(`payment_${p.code}`);
      payment = { transactionId: p.transactionId, method: p.method, last4: p.last4, amountSAR: q.chargeSAR };
    }
    let refund: BookingModification["refund"] = null;
    if (q.refundSAR > 0) {
      const r = await refundPayment(b.payment.transactionId, q.refundSAR);
      if (r.ok) refund = { refundId: r.refundId, amountSAR: q.refundSAR };
    }
    await confirmAgentChanges(approvals);
    committed = true;

    // 3) MT: the new travel details of every applicant (within the visa validity).
    const updated: StoredBooking = { ...b, criteria: q.next.criteria, flights: q.next.flights, hotels: q.next.hotels, activities: q.next.activities, price: q.next.price, ticketNos: q.next.ticketNos };
    const requestInitiatedBy = user.accountType === "company" ? user.company?.companyName : undefined;
    const mt = await pushToMt(updated, updated.applicants.map((a) => a.applicationNo), requestInitiatedBy);
    const modification: BookingModification = {
      id: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
      kind: q.kind,
      previousReturnDate: b.criteria.returnDate,
      newReturnDate: q.newReturnDate,
      target: q.target,
      lines: q.lines,
      chargeSAR: q.chargeSAR,
      refundSAR: q.refundSAR,
      payment,
      refund,
      previousTotalSAR: q.previousTotalSAR,
      newTotalSAR: q.newTotalSAR,
      agents: approvals.map((a) => ({ ...a, status: "APPROVED" as const })),
      mt: { messageId: mt.messageId, status: mtStatus(mt.results), results: mt.results },
      notified: null,
    };
    modification.notified = await notifyIfUpdated(updated, modification);

    const saved = await updateBooking(b.id, (cur) => ({
      ...cur,
      criteria: updated.criteria,
      flights: updated.flights,
      hotels: updated.hotels,
      activities: updated.activities,
      price: updated.price,
      ticketNos: updated.ticketNos,
      modifications: [...(cur.modifications ?? []), modification],
      version: (cur.version ?? 0) + 1,
      lock: null,
    }));
    return { booking: saved ?? updated, modification, replayed: false };
  } catch (err) {
    // Before payment nothing is final: withdraw the agents' approvals. Always free the booking.
    if (!committed && approvals.length) await releaseAgentChanges(approvals);
    await releaseLock(bookingId, token);
    throw err;
  }
}

/** Re-sends a modification's travel details to MT for the applicants that were not updated. */
export async function retryMtForBooking(b: StoredBooking, modificationId: string) {
  const m = b.modifications?.find((x) => x.id === modificationId);
  if (!m) throw new BookingError("notFound");
  if (m !== b.modifications![b.modifications!.length - 1]) throw new BookingError("notLatest");
  const failed = m.mt.results.filter((r) => !r.ok).map((r) => r.applicationNo);
  if (!failed.length) return b;
  const owner = b.accountType === "company" ? await getUserById(b.userId) : null;
  const mt = await pushToMt(b, failed, owner?.company?.companyName);
  const results = m.mt.results.map((r) => mt.results.find((x) => x.applicationNo === r.applicationNo) ?? r);
  const next: BookingModification = { ...m, mt: { messageId: mt.messageId, status: mtStatus(results), results } };
  next.notified = await notifyIfUpdated(b, next);
  return (await updateBooking(b.id, (cur) => ({ ...cur, modifications: cur.modifications!.map((x) => (x.id === m.id ? next : x)) })))!;
}

export async function retryModificationMt(user: PublicUser, bookingId: string, modificationId: string) {
  const b = await getBookingForUser(user.id, bookingId);
  if (!b) throw new BookingError("notFound");
  return retryMtForBooking(b, modificationId);
}
