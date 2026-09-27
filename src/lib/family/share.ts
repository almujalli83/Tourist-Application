/**
 * Read-only links to a trip for companions (no account needed): cities, dates, flights, hotels
 * and activities — never names, passports, prices or the booking reference. Only a hash of the
 * link is stored; links end two weeks after the trip or when revoked.
 */
import { createHash, randomBytes } from "node:crypto";
import { AccountError } from "../auth/account";
import type { StoredBooking } from "../bookings/types";
import { getBookingForUser } from "../repo";
import { siteUrl } from "../site";
import { store } from "../store";

interface TripShare {
  id: string;
  ref: string;
  userId: string;
  bookingId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
}

const hashOf = (raw: string) => createHash("sha256").update(raw).digest("hex");
const MAX_ACTIVE = 10;

const expiryOf = (b: StoredBooking) => new Date(Date.parse(`${b.criteria.returnDate}T23:59:59+03:00`) + 14 * 86_400_000).toISOString();

export async function listTripShares(userId: string, bookingId: string, now = new Date()) {
  return (await store().findBy<TripShare>("tripShares", "userId", userId))
    .filter((s) => s.bookingId === bookingId && !s.revokedAt && Date.parse(s.expiresAt) > now.getTime())
    .map((s) => ({ ref: s.ref, createdAt: s.createdAt, expiresAt: s.expiresAt }));
}

export async function createTripShare(userId: string, bookingId: string, locale: "ar" | "en", req: Request): Promise<{ url: string; ref: string; expiresAt: string }> {
  const b = await getBookingForUser(userId, bookingId);
  if (!b || b.status === "CANCELLED") throw new AccountError("notFound");
  const expiresAt = expiryOf(b);
  if (Date.parse(expiresAt) <= Date.now()) throw new AccountError("tripEnded");
  if ((await listTripShares(userId, bookingId)).length >= MAX_ACTIVE) throw new AccountError("tooManyLinks");
  const raw = randomBytes(24).toString("base64url");
  const s: TripShare = { id: hashOf(raw), ref: randomBytes(6).toString("hex"), userId, bookingId, createdAt: new Date().toISOString(), expiresAt };
  await store().put("tripShares", s.id, s);
  return { url: `${siteUrl(req)}/${locale}/trip/${raw}`, ref: s.ref, expiresAt };
}

export async function revokeTripShare(userId: string, ref: string): Promise<boolean> {
  const s = (await store().findBy<TripShare>("tripShares", "userId", userId)).find((x) => x.ref === ref && !x.revokedAt);
  if (!s) return false;
  await store().update<TripShare>("tripShares", s.id, (x) => ({ ...x, revokedAt: new Date().toISOString() }));
  return true;
}

export async function revokeAllTripShares(userId: string): Promise<void> {
  for (const s of await store().findBy<TripShare>("tripShares", "userId", userId)) if (!s.revokedAt) await revokeTripShare(userId, s.ref);
}

export interface SharedTrip {
  cities: string[];
  departureDate: string;
  returnDate: string;
  travellers: number;
  flights: { kind: string; flightNo: string; carrierNameAr: string; carrierNameEn: string; from: string; to: string; departAt: string; arriveAt: string }[];
  hotels: { city: string; nameAr: string; nameEn: string; districtAr: string; districtEn: string; checkIn: string; checkOut: string; lat?: number; lng?: number }[];
  activities: { city: string; titleAr: string; titleEn: string; venueAr: string; venueEn: string; date: string; timeFrom: string; timeTo: string }[];
  expiresAt: string;
}

export async function sharedTrip(raw: string, now = new Date()): Promise<SharedTrip | null> {
  if (typeof raw !== "string" || raw.length < 20 || raw.length > 60) return null;
  const s = await store().get<TripShare>("tripShares", hashOf(raw));
  if (!s || s.revokedAt || Date.parse(s.expiresAt) <= now.getTime()) return null;
  const b = await getBookingForUser(s.userId, s.bookingId);
  if (!b || b.status === "CANCELLED") return null;
  return {
    cities: b.criteria.stays.map((x) => x.city), departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate, travellers: b.applicants.length || b.criteria.pax.adults + b.criteria.pax.children + b.criteria.pax.infants,
    flights: b.flights.map((f) => ({ kind: f.kind, flightNo: f.flightNo, carrierNameAr: f.carrierNameAr, carrierNameEn: f.carrierNameEn, from: f.from, to: f.to, departAt: f.departAt, arriveAt: f.arriveAt })),
    hotels: b.hotels.map((h) => ({ city: h.city, nameAr: h.nameAr, nameEn: h.nameEn, districtAr: h.districtAr, districtEn: h.districtEn, checkIn: h.checkIn, checkOut: h.checkOut, ...(h.lat !== undefined && h.lng !== undefined ? { lat: h.lat, lng: h.lng } : {}) })),
    activities: b.activities.map((a) => ({ city: a.city, titleAr: a.titleAr, titleEn: a.titleEn, venueAr: a.venueAr, venueEn: a.venueEn, date: a.date, timeFrom: a.timeFrom, timeTo: a.timeTo })),
    expiresAt: s.expiresAt,
  };
}
