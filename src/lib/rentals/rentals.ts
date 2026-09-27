/**
 * Car rental: the traveller searches (or starts from a package stay), the rental companies' APIs
 * return cars and prices (re-checked when booking, never taken from the browser), and the request
 * is sent to the chosen company; its confirmation and counter are followed until pickup. No online
 * payment: the rental is paid at the counter, where the deposit is held on the driver's card.
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import type { StoredBooking } from "../bookings/types";
import { cityName, getStayCity } from "../data/cities";
import { getCountry } from "../data/countries";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { AIRPORTS } from "../transport/rides";
import { getLicenceRules, ruleFor, type LicenceRule } from "./licence";
import { RentalProviderError, rentalProviderById, rentalProvidersFor } from "./providers";
import { CAR_CLASSES, RENTAL_EXTRAS, rentalDays, type PublicRental, type RentalExtra, type RentalQuery, type RentalQuote } from "./types";

const COL = "rentals" as const;
type Stored = PublicRental & { userId: string; phone: string; email: string; seen?: string[] };

export class RentalError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const ksaMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00+03:00`);
const toLocal = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16);
const hour = (ms: number) => Math.ceil(ms / 3_600_000) * 3_600_000;
const strip = ({ userId: _u, phone: _p, email: _e, seen: _s, ...r }: Stored): PublicRental => r; // eslint-disable-line @typescript-eslint/no-unused-vars
const MAX_DAYS = 60;

/** Checks and normalises a search (the city, spots, dates, driver). */
export function validateQuery(q: Partial<RentalQuery>, now: Date): RentalQuery {
  const city = String(q.city ?? "").toUpperCase();
  const dropoffCity = String(q.dropoffCity || city).toUpperCase();
  if (!getStayCity(city) || !getStayCity(dropoffCity)) throw new RentalError("invalidCity");
  const pickupSpot = q.pickupSpot === "airport" ? "airport" : "city";
  const dropoffSpot = q.dropoffSpot === "airport" ? "airport" : "city";
  if ((pickupSpot === "airport" && !AIRPORTS[city]) || (dropoffSpot === "airport" && !AIRPORTS[dropoffCity])) throw new RentalError("noAirport");
  const re = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (!re.test(String(q.pickupAt)) || !re.test(String(q.returnAt))) throw new RentalError("invalidTime");
  const from = ksaMs(q.pickupAt!);
  const to = ksaMs(q.returnAt!);
  if (from < now.getTime() + 2 * 3_600_000) throw new RentalError("tooSoon");
  if (to - from < 20 * 3_600_000) throw new RentalError("tooShort");
  if (rentalDays(q.pickupAt!, q.returnAt!) > MAX_DAYS) throw new RentalError("tooLong");
  const driverAge = Math.round(Number(q.driverAge));
  if (!(driverAge >= 18 && driverAge <= 99)) throw new RentalError("invalidAge");
  const licenceCountry = String(q.licenceCountry ?? "").toUpperCase();
  if (!getCountry(licenceCountry)) throw new RentalError("invalidCountry");
  return { city, pickupSpot, dropoffCity, dropoffSpot, pickupAt: q.pickupAt!, returnAt: q.returnAt!, driverAge, licenceCountry };
}

/** One suggested rental per city stay of a package: from the airport on arrival, back before the flight home. */
export function rentalPlansFromBooking(b: StoredBooking): RentalQuery[] {
  const hotels = [...b.hotels].sort((x, y) => x.checkIn.localeCompare(y.checkIn));
  const lead = b.applicants[0];
  const out = b.flights.find((f) => f.kind === "outbound");
  const back = b.flights.find((f) => f.kind === "return");
  return hotels.map((h, i) => {
    const first = i === 0 && out && out.to === h.city && AIRPORTS[h.city];
    const last = i === hotels.length - 1 && back && back.from === h.city && AIRPORTS[h.city];
    return {
      city: h.city, dropoffCity: h.city,
      pickupSpot: first ? "airport" : "city",
      dropoffSpot: last ? "airport" : "city",
      pickupAt: first ? toLocal(hour(ksaMs(out.arriveAt) + 3_600_000)) : `${h.checkIn}T10:00`,
      returnAt: last ? toLocal(ksaMs(back.departAt) - 4 * 3_600_000) : `${h.checkOut}T10:00`,
      driverAge: 30, // not kept with the booking: the traveller confirms it
      licenceCountry: lead?.nationality ?? "",
    };
  });
}

async function collectQuotes(q: RentalQuery): Promise<RentalQuote[]> {
  const providers = rentalProvidersFor(q.city);
  if (!providers.length) throw new RentalError("noProvider", 409);
  const all = await Promise.all(providers.map((p) => p.quote(q).catch(() => [] as RentalQuote[])));
  return all.flat().sort((a, b) => CAR_CLASSES.indexOf(a.carClass) - CAR_CLASSES.indexOf(b.carClass) || a.totalSAR - b.totalSAR);
}

export interface RentalOptions { query: RentalQuery; quotes: RentalQuote[]; licence: LicenceRule | null; reviewed: boolean; sourceUrl: string }

/** Cars and prices from the companies, with the licence requirements for the driver. */
export async function rentalOptions(input: Partial<RentalQuery>, now = new Date()): Promise<RentalOptions> {
  const query = validateQuery(input, now);
  const [quotes, rules] = await Promise.all([collectQuotes(query), getLicenceRules()]);
  return { query, quotes, licence: ruleFor(rules, query.licenceCountry), reviewed: !!rules.reviewedAt, sourceUrl: rules.sourceUrl };
}

export interface RentalRequestInput extends Partial<RentalQuery> { bookingId?: string; providerId: string; quoteId: string; extras?: string[]; driverName?: string; phone?: string; acceptLicence?: boolean }

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  const sent = await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }, { bookingId: doc.bookingId || undefined });
  if (sent) await store().update<AppNotification>("notifications", doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
}

/** Books the chosen car with the company (the price is re-quoted, never taken from the browser). */
export async function requestRental(user: PublicUser, input: RentalRequestInput, now = new Date()): Promise<PublicRental> {
  const query = validateQuery(input, now);
  if (input.acceptLicence !== true) throw new RentalError("licenceNotAccepted");
  let booking: StoredBooking | undefined;
  if (input.bookingId) {
    booking = (await listBookingsByUser(user.id)).find((b) => b.id === input.bookingId);
    if (!booking) throw new RentalError("bookingNotFound", 404);
    if (booking.status === "CANCELLED" || booking.mt.packageStatus === "CANCELLED") throw new RentalError("bookingCancelled", 409);
  }
  const mine = await store().findBy<Stored>(COL, "userId", user.id);
  const from = ksaMs(query.pickupAt);
  const to = ksaMs(query.returnAt);
  if (mine.some((r) => (r.status === "requested" || r.status === "confirmed") && ksaMs(r.pickupAt) < to && ksaMs(r.returnAt) > from)) throw new RentalError("overlap", 409);
  const provider = rentalProviderById(String(input.providerId ?? ""));
  if (!provider || !(provider.sandbox ? rentalProvidersFor(query.city).some((p) => p.id === provider.id) : provider.cities.includes(query.city))) throw new RentalError("noProvider", 409);
  let quote: RentalQuote | undefined;
  try {
    quote = (await provider.quote(query)).find((q) => q.quoteId === input.quoteId);
  } catch {
    throw new RentalError("providerUnavailable", 502);
  }
  if (!quote) throw new RentalError("quoteExpired", 409);
  if (query.driverAge < quote.minAge) throw new RentalError("driverTooYoung", 409);
  const extras = [...new Set((input.extras ?? []).filter((e): e is RentalExtra => (RENTAL_EXTRAS as readonly string[]).includes(e) && quote!.extras[e as RentalExtra] !== undefined))];
  const totalSAR = Math.round((quote.totalSAR + extras.reduce((s, e) => s + (quote!.extras[e] ?? 0), 0)) * 100) / 100;
  const driverName = String(input.driverName ?? "").trim().slice(0, 80) || (user.individual?.fullName ?? user.company?.contactPerson ?? "");
  if (!driverName) throw new RentalError("invalidDriver");
  const phone = String(input.phone ?? user.individual?.phone ?? user.company?.phone ?? "").replace(/[^\d+]/g, "");
  if (phone.length < 8) throw new RentalError("invalidPhone");
  const reference = `CR-${randomBytes(3).toString("hex").toUpperCase()}`;
  let booked;
  try {
    booked = await provider.book({ ...query, quoteId: quote.quoteId, extras, driverName, phone, email: user.email, reference }, now);
  } catch (e) {
    throw new RentalError(e instanceof RentalProviderError && e.code === "rejected" ? "providerRejected" : "providerUnavailable", 502);
  }
  const at = now.toISOString();
  const r: Stored = {
    ...query, id: randomBytes(10).toString("hex"), reference, userId: user.id, phone, email: user.email,
    bookingId: booking?.id ?? null, bookingReference: booking?.reference ?? null,
    carClass: quote.carClass, model: quote.model, seats: quote.seats, automatic: quote.automatic, days: quote.days, extras, totalSAR,
    depositSAR: quote.depositSAR, kmPerDay: quote.kmPerDay, freeCancelHours: quote.freeCancelHours, driverName,
    providerId: provider.id, providerNameAr: provider.nameAr, providerNameEn: provider.nameEn, providerRef: booked.ref,
    confirmation: booked.confirmation, counter: booked.counter, status: booked.status, cancelReason: null, createdAt: at, updatedAt: at,
    ...(provider.sandbox ? { sandbox: true } : {}),
  };
  await store().put(COL, r.id, r);
  return strip(r);
}

const when = (local: string) => `${local.slice(0, 10)} ${local.slice(11, 16)}`;
const spotAr = (r: RentalQuery, back = false) => {
  const [c, s] = back ? [r.dropoffCity, r.dropoffSpot] : [r.city, r.pickupSpot];
  return s === "airport" ? `مطار ${cityName(c, "ar")}` : `فرع ${cityName(c, "ar")}`;
};
const spotEn = (r: RentalQuery, back = false) => {
  const [c, s] = back ? [r.dropoffCity, r.dropoffSpot] : [r.city, r.pickupSpot];
  return s === "airport" ? `${cityName(c, "en")} airport` : `${cityName(c, "en")} branch`;
};

/** Follows the company's status (confirmation, counter) and tells the traveller of changes. */
async function refresh(r: Stored, now: Date): Promise<Stored> {
  if (r.status !== "requested" && r.status !== "confirmed") return r;
  if (ksaMs(r.returnAt) + 6 * 3_600_000 < now.getTime()) {
    return (await store().update<Stored>(COL, r.id, (x) => ({ ...x, status: "completed", updatedAt: now.toISOString() })))!;
  }
  const provider = rentalProviderById(r.providerId);
  if (!provider) return r;
  let s;
  try {
    s = await provider.status(r.providerRef, r.createdAt, now, r);
  } catch {
    return r;
  }
  if (s.status === r.status && s.confirmation === r.confirmation && JSON.stringify(s.counter) === JSON.stringify(r.counter)) return r;
  const out = (await store().update<Stored>(COL, r.id, (x) => ({
    ...x, status: s.status, confirmation: s.confirmation ?? x.confirmation, counter: s.counter ?? x.counter,
    cancelReason: s.status === "cancelled" || s.status === "rejected" ? "provider" : x.cancelReason, updatedAt: now.toISOString(),
  })))!;
  const base = { userId: r.userId, kind: "transport" as const, bookingId: r.bookingId ?? "", reference: r.reference, createdAt: now.toISOString(), href: `/account/rentals/${r.id}`, readAt: null, deletedAt: null, email: null };
  if (out.status === "confirmed" && r.status !== "confirmed") {
    await notify(r.userId, {
      ...base, id: `rental:confirmed:${r.id}`,
      titleAr: `تأكد استئجار السيارة — ${out.providerNameAr}`, titleEn: `Car rental confirmed — ${out.providerNameEn}`,
      linesAr: [`رقم التأكيد ${out.confirmation ?? "—"} · ${out.model} أو ما يماثلها`, `الاستلام ${when(out.pickupAt)} من ${spotAr(out)}${out.counter ? ` (${out.counter.address})` : ""}، والتسليم ${when(out.returnAt)} في ${spotAr(out, true)}.`, "أحضر الرخصة وجواز السفر وبطاقة ائتمان باسم السائق للتأمين."],
      linesEn: [`Confirmation ${out.confirmation ?? "—"} · ${out.model} or similar`, `Pick up ${when(out.pickupAt)} at ${spotEn(out)}${out.counter ? ` (${out.counter.address})` : ""}, return ${when(out.returnAt)} at ${spotEn(out, true)}.`, "Bring your licence, passport and a credit card in the driver's name for the deposit."],
    });
  } else if (out.status === "rejected" || out.status === "cancelled") {
    await notify(r.userId, {
      ...base, id: `rental:rejected:${r.id}`, severity: "warning",
      titleAr: "تعذّر تأكيد استئجار السيارة", titleEn: "Car rental could not be confirmed",
      linesAr: [`اعتذرت ${out.providerNameAr} عن الطلب. يمكنك اختيار سيارة أخرى من صفحة التنقل.`],
      linesEn: [`${out.providerNameEn} declined the request. You can choose another car on the Getting around page.`],
    });
  }
  return out;
}

export async function listRentals(userId: string, now = new Date()): Promise<PublicRental[]> {
  await reconcileRentals(userId, now);
  const out: PublicRental[] = [];
  for (const r of await store().findBy<Stored>(COL, "userId", userId)) out.push(strip(await refresh(r, now)));
  return out.sort((a, b) => a.pickupAt.localeCompare(b.pickupAt));
}

export async function getRental(userId: string, id: string, now = new Date()): Promise<PublicRental | null> {
  const r = await store().get<Stored>(COL, id);
  if (!r || r.userId !== userId) return null;
  return strip(await refresh(r, now));
}

/** Free cancellation until the company's limit before pickup. */
export async function cancelRental(userId: string, id: string, now = new Date(), reason: "traveller" | "packageCancelled" = "traveller"): Promise<PublicRental> {
  const r = await store().get<Stored>(COL, id);
  if (!r || r.userId !== userId) throw new RentalError("notFound", 404);
  if (r.status !== "requested" && r.status !== "confirmed") throw new RentalError("notCancellable", 409);
  if (reason === "traveller" && now.getTime() > ksaMs(r.pickupAt) - r.freeCancelHours * 3_600_000) throw new RentalError("tooLateToCancel", 409);
  try {
    await rentalProviderById(r.providerId)?.cancel(r.providerRef);
  } catch (e) {
    if (!(e instanceof RentalProviderError && e.code === "rejected")) throw new RentalError("providerUnavailable", 502);
  }
  return strip((await store().update<Stored>(COL, id, (x) => ({ ...x, status: "cancelled", cancelReason: reason, updatedAt: now.toISOString() })))!);
}

/** Rentals made for a package that was cancelled are cancelled with the company. */
export async function reconcileRentals(userId: string, now = new Date()): Promise<number> {
  const active = (await store().findBy<Stored>(COL, "userId", userId)).filter((r) => r.bookingId && (r.status === "requested" || r.status === "confirmed"));
  if (!active.length) return 0;
  const bookings = await listBookingsByUser(userId);
  let n = 0;
  for (const r of active) {
    const b = bookings.find((x) => x.id === r.bookingId);
    if (b && b.status !== "CANCELLED" && b.mt.packageStatus !== "CANCELLED") continue;
    try {
      await cancelRental(userId, r.id, now, "packageCancelled");
      n++;
    } catch {
      /* the company is unreachable: tried again next time */
    }
  }
  return n;
}

/** Reminders: the day before pickup (what to bring, where), and the day before the return. */
export async function rentalReminders(userId: string, now = new Date()): Promise<number> {
  let n = 0;
  for (const r of await listRentals(userId, now)) {
    if (r.status !== "confirmed" && r.status !== "requested") continue;
    const base = { userId, kind: "transport" as const, bookingId: r.bookingId ?? "", reference: r.reference, createdAt: now.toISOString(), href: `/account/rentals/${r.id}`, readAt: null, deletedAt: null, email: null };
    const toPickup = ksaMs(r.pickupAt) - now.getTime();
    if (toPickup > 0 && toPickup <= 30 * 3_600_000 && !(await store().get("notifications", `rental:pickup:${r.id}`))) {
      await notify(userId, {
        ...base, id: `rental:pickup:${r.id}`,
        titleAr: `استلام السيارة ${when(r.pickupAt)}`, titleEn: `Car pickup ${when(r.pickupAt)}`,
        linesAr: [`من ${spotAr(r)}${r.counter ? ` — ${r.counter.address} (${r.counter.phone})` : ""} · ${r.providerNameAr}${r.confirmation ? ` · رقم التأكيد ${r.confirmation}` : ""}`, "أحضر رخصة القيادة (والرخصة الدولية أو الترجمة المعتمدة إن لزم) وجواز السفر وبطاقة ائتمان باسم السائق."],
        linesEn: [`At ${spotEn(r)}${r.counter ? ` — ${r.counter.address} (${r.counter.phone})` : ""} · ${r.providerNameEn}${r.confirmation ? ` · confirmation ${r.confirmation}` : ""}`, "Bring your driving licence (and the International Driving Permit or accredited translation if needed), passport and a credit card in the driver's name."],
      });
      n++;
    }
    const toReturn = ksaMs(r.returnAt) - now.getTime();
    if (r.status === "confirmed" && toReturn > 0 && toReturn <= 24 * 3_600_000 && ksaMs(r.pickupAt) < now.getTime() && !(await store().get("notifications", `rental:return:${r.id}`))) {
      await notify(userId, {
        ...base, id: `rental:return:${r.id}`,
        titleAr: `تسليم السيارة ${when(r.returnAt)}`, titleEn: `Car return ${when(r.returnAt)}`,
        linesAr: [`في ${spotAr(r, true)}. أعد السيارة بمستوى الوقود نفسه، والتأخير قد يُحتسب يومًا إضافيًا.`],
        linesEn: [`At ${spotEn(r, true)}. Return it with the same fuel level; a late return may count as an extra day.`],
      });
      n++;
    }
  }
  return n;
}
