/**
 * Airport transfers with meet & greet: from a package (the flight, hotels and party come from the
 * booking) or entered by hand. Prices come from the transfer companies' APIs (re-checked when
 * booking, never taken from the browser); the request is sent to the company, and its status and
 * driver are followed until the ride. No online payment: the price is paid to the driver.
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import type { StoredBooking } from "../bookings/types";
import { cityName, UMRAH_CITY } from "../data/cities";
import { parseCoords } from "../guides/bookings";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { AIRPORTS, estimateRide } from "../transport/rides";
import { ProviderError, providerById, providersFor, type QuoteRequest } from "./providers";
import { suggestVehicle, VEHICLES, type Direction, type Place, type PublicTransfer, type TransferExtras, type TransferQuote, type Vehicle } from "./types";

const COL = "transfers" as const;
type Stored = PublicTransfer & { userId: string; phone: string; seen?: { confirmed?: boolean; rejected?: boolean } };

export class TransferError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

/** Be at the airport this long before an international take-off. */
const AIRPORT_BEFORE_MIN = 180;
const ksaMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00+03:00`);
const toLocal = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);
const quarter = (ms: number) => Math.floor(ms / 900_000) * 900_000;
const strip = ({ userId: _u, phone: _p, seen: _s, ...t }: Stored): PublicTransfer => t; // eslint-disable-line @typescript-eslint/no-unused-vars

export interface TransferPlan extends QuoteRequest { bookingId: string | null; bookingReference: string | null; city: string; leadName: string }

/** The ride of a package in one direction (null when the flight or hotel is missing). */
export function planFromBooking(b: StoredBooking, direction: Direction): TransferPlan | null {
  const hotels = [...b.hotels].sort((x, y) => x.checkIn.localeCompare(y.checkIn));
  const pax = b.applicants.length || b.criteria.pax.adults + b.criteria.pax.children + b.criteria.pax.infants;
  const lead = b.applicants[0]?.nameEn ?? "";
  if (direction === "arrival") {
    const f = b.flights.find((x) => x.kind === "outbound");
    const h = hotels[0];
    if (!f || !h || !AIRPORTS[f.to]) return null;
    return {
      bookingId: b.id, bookingReference: b.reference, direction, airport: f.to, city: h.city, flightNo: f.flightNo, flightAt: f.arriveAt, pickupAt: f.arriveAt,
      place: { name: h.nameEn, lat: h.lat ?? null, lng: h.lng ?? null }, pax, bags: pax, leadName: lead,
    };
  }
  const f = b.flights.find((x) => x.kind === "return");
  const h = hotels[hotels.length - 1];
  if (!f || !h || !AIRPORTS[f.from]) return null;
  const ride = h.lat != null && h.lng != null ? estimateRide({ lat: h.lat, lng: h.lng }, AIRPORTS[f.from]).mins : 60;
  return {
    bookingId: b.id, bookingReference: b.reference, direction, airport: f.from, city: h.city, flightNo: f.flightNo, flightAt: f.departAt,
    pickupAt: toLocal(quarter(ksaMs(f.departAt) - (AIRPORT_BEFORE_MIN + ride + 15) * 60_000)),
    place: { name: h.nameEn, lat: h.lat ?? null, lng: h.lng ?? null }, pax, bags: pax, leadName: lead,
  };
}

export interface ManualInput { direction: Direction; airport: string; flightNo: string; flightAt: string; placeName: string; placeLink?: string; pax: number; bags: number }

function planFromManual(user: PublicUser, m: ManualInput, now: Date): TransferPlan {
  const airport = String(m.airport ?? "").toUpperCase();
  if (!AIRPORTS[airport]) throw new TransferError("invalidAirport");
  if (m.direction !== "arrival" && m.direction !== "departure") throw new TransferError("invalidDirection");
  if (!/^[A-Z0-9]{2,3}\s?\d{1,4}$/i.test(String(m.flightNo ?? "").trim())) throw new TransferError("invalidFlight");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(m.flightAt ?? "")) || ksaMs(m.flightAt) <= now.getTime()) throw new TransferError("invalidTime");
  const name = String(m.placeName ?? "").trim().slice(0, 120);
  if (!name) throw new TransferError("invalidPlace");
  const pax = Math.round(Number(m.pax));
  const bags = Math.round(Number(m.bags));
  if (!(pax >= 1 && pax <= 10) || !(bags >= 0 && bags <= 15)) throw new TransferError("invalidParty");
  const c = parseCoords(m.placeLink);
  const place: Place = { name, lat: c?.lat ?? null, lng: c?.lng ?? null };
  const ride = c ? estimateRide(c, AIRPORTS[airport]).mins : 60;
  const flightNo = m.flightNo.trim().toUpperCase().replace(/\s+/g, "");
  return {
    bookingId: null, bookingReference: null, direction: m.direction, airport, city: airport, flightNo, flightAt: m.flightAt,
    pickupAt: m.direction === "arrival" ? m.flightAt : toLocal(quarter(ksaMs(m.flightAt) - (AIRPORT_BEFORE_MIN + ride + 15) * 60_000)),
    place, pax, bags, leadName: user.individual?.fullName ?? user.company?.contactPerson ?? user.email,
  };
}

async function planFor(user: PublicUser, input: { bookingId?: string; direction?: Direction; manual?: ManualInput }, now: Date): Promise<TransferPlan> {
  if (input.manual) return planFromManual(user, input.manual, now);
  const b = (await listBookingsByUser(user.id)).find((x) => x.id === input.bookingId);
  if (!b) throw new TransferError("bookingNotFound", 404);
  if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED") throw new TransferError("bookingCancelled", 409);
  const plan = planFromBooking(b, input.direction === "departure" ? "departure" : "arrival");
  if (!plan) throw new TransferError("noFlightOrHotel", 409);
  if (ksaMs(plan.pickupAt) <= now.getTime()) throw new TransferError("tooLate", 409);
  return plan;
}

const quoteRequest = (p: TransferPlan): QuoteRequest => ({ direction: p.direction, airport: p.airport, flightNo: p.flightNo, flightAt: p.flightAt, pickupAt: p.pickupAt, place: p.place, pax: p.pax, bags: p.bags });

async function collectQuotes(p: TransferPlan): Promise<TransferQuote[]> {
  const providers = providersFor(p.airport);
  if (!providers.length) throw new TransferError("noProvider", 409);
  const all = await Promise.all(providers.map((x) => x.quote(quoteRequest(p)).catch(() => [] as TransferQuote[])));
  return all.flat().sort((a, b) => VEHICLES.indexOf(a.vehicle) - VEHICLES.indexOf(b.vehicle) || a.priceSAR - b.priceSAR);
}

/** The ride details and the companies' offers (vehicles and prices). */
export async function transferOptions(user: PublicUser, input: { bookingId?: string; direction?: Direction; manual?: ManualInput }, now = new Date()) {
  const plan = await planFor(user, input, now);
  const quotes = await collectQuotes(plan);
  return { plan, quotes, suggested: suggestVehicle(plan.pax, plan.bags) };
}

export interface RequestInput { bookingId?: string; direction?: Direction; manual?: ManualInput; providerId: string; quoteId: string; extras?: Partial<TransferExtras>; notes?: string; phone?: string }

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  const sent = await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }, { bookingId: doc.bookingId || undefined });
  if (sent) await store().update<AppNotification>("notifications", doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
}

const DIR_AR: Record<Direction, string> = { arrival: "الاستقبال من المطار", departure: "التوصيل إلى المطار" };
const DIR_EN: Record<Direction, string> = { arrival: "Airport pickup", departure: "Ride to the airport" };

/** Books the ride with the chosen company (the price is re-quoted, never taken from the browser). */
export async function requestTransfer(user: PublicUser, input: RequestInput, now = new Date()): Promise<PublicTransfer> {
  const plan = await planFor(user, input, now);
  const mine = await store().findBy<Stored>(COL, "userId", user.id);
  if (plan.bookingId && mine.some((t) => t.bookingId === plan.bookingId && t.direction === plan.direction && (t.status === "requested" || t.status === "confirmed")))
    throw new TransferError("duplicate", 409);
  const provider = providerById(String(input.providerId ?? ""));
  if (!provider || !provider.airports.includes(plan.airport)) throw new TransferError("noProvider", 409);
  let quote: TransferQuote | undefined;
  try {
    quote = (await provider.quote(quoteRequest(plan))).find((q) => q.quoteId === input.quoteId);
  } catch {
    throw new TransferError("providerUnavailable", 502);
  }
  if (!quote) throw new TransferError("quoteExpired", 409);
  const extras: TransferExtras = { childSeat: input.extras?.childSeat === true, wheelchair: input.extras?.wheelchair === true, extraBags: Math.min(10, Math.max(0, Math.round(Number(input.extras?.extraBags ?? 0)) || 0)) };
  const notes = String(input.notes ?? "").trim().slice(0, 300);
  const phone = String(input.phone ?? user.individual?.phone ?? user.company?.phone ?? "").replace(/[^\d+]/g, "");
  const reference = `TR-${randomBytes(3).toString("hex").toUpperCase()}`;
  let booked;
  try {
    booked = await provider.book({ ...quoteRequest(plan), quoteId: quote.quoteId, vehicle: quote.vehicle, extras, notes, leadName: plan.leadName, phone, reference }, now);
  } catch (e) {
    throw new TransferError(e instanceof ProviderError && e.code === "rejected" ? "providerRejected" : "providerUnavailable", 502);
  }
  const at = now.toISOString();
  const t: Stored = {
    id: randomBytes(10).toString("hex"), reference, userId: user.id, phone,
    bookingId: plan.bookingId, bookingReference: plan.bookingReference, direction: plan.direction, airport: plan.airport, city: plan.city,
    flightNo: plan.flightNo, flightAt: plan.flightAt, pickupAt: plan.pickupAt, place: plan.place, pax: plan.pax, bags: plan.bags,
    vehicle: quote.vehicle as Vehicle, priceSAR: quote.priceSAR, freeWaitMins: quote.freeWaitMins, freeCancelHours: quote.freeCancelHours, extras, notes,
    leadName: plan.leadName, providerId: provider.id, providerNameAr: provider.nameAr, providerNameEn: provider.nameEn, providerRef: booked.ref,
    status: booked.status, driver: booked.driver, cancelReason: null, createdAt: at, updatedAt: at, ...(provider.sandbox ? { sandbox: true } : {}),
  };
  await store().put(COL, t.id, t);
  return strip(t);
}

/** Follows the company's status (confirmation, driver) and tells the traveller of changes. */
async function refresh(t: Stored, now: Date): Promise<Stored> {
  if (t.status !== "requested" && t.status !== "confirmed") return t;
  if (ksaMs(t.pickupAt) + 6 * 3_600_000 < now.getTime()) {
    return (await store().update<Stored>(COL, t.id, (x) => ({ ...x, status: "completed", updatedAt: now.toISOString() })))!;
  }
  const provider = providerById(t.providerId);
  if (!provider) return t;
  let s;
  try {
    s = await provider.status(t.providerRef, t.createdAt, now);
  } catch {
    return t;
  }
  if (s.status === t.status && JSON.stringify(s.driver) === JSON.stringify(t.driver)) return t;
  const out = (await store().update<Stored>(COL, t.id, (x) => ({ ...x, status: s.status, driver: s.driver ?? x.driver, cancelReason: s.status === "cancelled" || s.status === "rejected" ? "provider" : x.cancelReason, updatedAt: now.toISOString() })))!;
  const base = { userId: t.userId, kind: "transport" as const, bookingId: t.bookingId ?? "", reference: t.reference, createdAt: now.toISOString(), href: `/account/transfers/${t.id}`, readAt: null, deletedAt: null, email: null };
  const when = `${t.pickupAt.slice(0, 10)} ${t.pickupAt.slice(11, 16)}`;
  if (out.status === "confirmed" && out.driver) {
    await notify(t.userId, {
      ...base, id: `transfer:confirmed:${t.id}`,
      titleAr: `تأكد ${DIR_AR[t.direction]}`, titleEn: `${DIR_EN[t.direction]} confirmed`,
      linesAr: [`${when} — السائق ${out.driver.name} (${out.driver.phone}) · ${out.driver.car} · ${out.driver.plate}`, t.direction === "arrival" ? "سيستقبلك في صالة الوصول بلوحة عليها اسمك." : "سيصل إلى فندقك في الموعد."],
      linesEn: [`${when} — driver ${out.driver.name} (${out.driver.phone}) · ${out.driver.car} · ${out.driver.plate}`, t.direction === "arrival" ? "They'll meet you in the arrivals hall with a sign with your name." : "They'll be at your hotel on time."],
    });
  } else if (out.status === "rejected" || out.status === "cancelled") {
    await notify(t.userId, {
      ...base, id: `transfer:rejected:${t.id}`, severity: "warning",
      titleAr: `تعذّر تأكيد ${DIR_AR[t.direction]}`, titleEn: `${DIR_EN[t.direction]} could not be confirmed`,
      linesAr: ["اعتذرت شركة النقل عن الطلب. يمكنك طلب سيارة أخرى من صفحة الحجز أو استخدام تطبيقات النقل."],
      linesEn: ["The transfer company declined the request. You can request another car from the booking page or use a ride app."],
    });
  }
  return out;
}

export async function listTransfers(userId: string, now = new Date()): Promise<PublicTransfer[]> {
  await reconcileTransfers(userId, now);
  const out: PublicTransfer[] = [];
  for (const t of await store().findBy<Stored>(COL, "userId", userId)) out.push(strip(await refresh(t, now)));
  return out.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}

export async function getTransfer(userId: string, id: string, now = new Date()): Promise<PublicTransfer | null> {
  const t = await store().get<Stored>(COL, id);
  if (!t || t.userId !== userId) return null;
  return strip(await refresh(t, now));
}

/** Free cancellation until the company's limit before pickup. */
export async function cancelTransfer(userId: string, id: string, now = new Date(), reason: "traveller" | "packageCancelled" = "traveller"): Promise<PublicTransfer> {
  const t = await store().get<Stored>(COL, id);
  if (!t || t.userId !== userId) throw new TransferError("notFound", 404);
  if (t.status !== "requested" && t.status !== "confirmed") throw new TransferError("notCancellable", 409);
  if (reason === "traveller" && now.getTime() > ksaMs(t.pickupAt) - t.freeCancelHours * 3_600_000) throw new TransferError("tooLateToCancel", 409);
  const provider = providerById(t.providerId);
  try {
    await provider?.cancel(t.providerRef);
  } catch (e) {
    if (!(e instanceof ProviderError && e.code === "rejected")) throw new TransferError("providerUnavailable", 502);
  }
  return strip((await store().update<Stored>(COL, id, (x) => ({ ...x, status: "cancelled", cancelReason: reason, updatedAt: now.toISOString() })))!);
}

/** Rides of a cancelled package are cancelled with the company. */
export async function reconcileTransfers(userId: string, now = new Date()): Promise<number> {
  const active = (await store().findBy<Stored>(COL, "userId", userId)).filter((t) => t.bookingId && (t.status === "requested" || t.status === "confirmed"));
  if (!active.length) return 0;
  const bookings = await listBookingsByUser(userId);
  let n = 0;
  for (const t of active) {
    const b = bookings.find((x) => x.id === t.bookingId);
    if (b && b.status !== "CANCELLED" && b.mt.packageStatus !== "CANCELLED") continue;
    try {
      await cancelTransfer(userId, t.id, now, "packageCancelled");
      n++;
    } catch {
      /* the company is unreachable: tried again next time */
    }
  }
  return n;
}

/**
 * Reminders: once the visas are issued, offer the airport pickup; the day before a ride, remind
 * with the time and driver; while a request waits, keep following the company.
 */
export async function transferReminders(userId: string, now = new Date()): Promise<number> {
  let n = 0;
  const transfers = await listTransfers(userId, now);
  for (const b of await listBookingsByUser(userId)) {
    if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED" || !b.applicants.some((a) => a.visaNumber)) continue;
    const plan = planFromBooking(b, "arrival");
    if (!plan || ksaMs(plan.pickupAt) <= now.getTime() || !providersFor(plan.airport).length) continue;
    if (transfers.some((t) => t.bookingId === b.id && t.direction === "arrival" && t.status !== "cancelled" && t.status !== "rejected")) continue;
    const city = cityName(plan.city === UMRAH_CITY ? UMRAH_CITY : plan.city, "ar");
    const doc: AppNotification = {
      id: `transfer:offer:${b.id}`, userId, kind: "transport", bookingId: b.id, reference: b.reference, createdAt: now.toISOString(),
      titleAr: "هل تريد من يستقبلك في المطار؟", titleEn: "Would you like to be met at the airport?",
      linesAr: [`سائق بانتظارك في صالة الوصول بلوحة عليها اسمك عند هبوطك (${plan.flightNo}) ليوصلك إلى فندقك في ${city}، ويتابع موعد رحلتك.`, "اختر السيارة المناسبة من صفحة الحجز؛ الدفع للسائق عند الوصول."],
      linesEn: [`A driver waits in the arrivals hall with a sign with your name when you land (${plan.flightNo}) and takes you to your hotel in ${cityName(plan.city, "en")}, following your flight.`, "Choose the car on the booking page; you pay the driver on arrival."],
      href: `/account/bookings/${b.id}#transfers`, readAt: null, deletedAt: null, email: null,
    };
    if (await store().get("notifications", doc.id)) continue;
    await notify(userId, doc);
    n++;
  }
  for (const t of transfers) {
    if (t.status !== "confirmed" && t.status !== "requested") continue;
    const ms = ksaMs(t.pickupAt) - now.getTime();
    if (ms <= 0 || ms > 30 * 3_600_000) continue;
    const when = t.pickupAt.slice(11, 16);
    const drv = t.driver ? `${t.driver.name} · ${t.driver.phone} · ${t.driver.car} · ${t.driver.plate}` : null;
    await notify(userId, {
      id: `transfer:soon:${t.id}`, userId, kind: "transport", bookingId: t.bookingId ?? "", reference: t.reference, createdAt: now.toISOString(),
      titleAr: `${DIR_AR[t.direction]} الساعة ${when}`, titleEn: `${DIR_EN[t.direction]} at ${when}`,
      linesAr: [t.direction === "arrival" ? `رحلة ${t.flightNo}: السائق ينتظرك في صالة الوصول بلوحة عليها اسمك.` : `السائق يصل إلى ${t.place.name} الساعة ${when}.`, drv ? `السائق: ${drv}` : "بانتظار تأكيد الشركة وبيانات السائق."],
      linesEn: [t.direction === "arrival" ? `Flight ${t.flightNo}: the driver waits in the arrivals hall with a sign with your name.` : `The driver arrives at ${t.place.name} at ${when}.`, drv ? `Driver: ${drv}` : "Waiting for the company's confirmation and driver details."],
      href: `/account/transfers/${t.id}`, readAt: null, deletedAt: null, email: null,
    });
    n++;
  }
  return n;
}
