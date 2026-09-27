/**
 * «Order a car» for the traveller's bookings (client-safe): the destination of each kind of
 * booking, shown from the day before it until it ends; nothing for past or cancelled bookings.
 */
import { AIRPORTS, type RideDestination } from "./rides";

/** The button appears this long before the booking starts. */
export const RIDE_LEAD_MS = 24 * 3_600_000;

export interface RideTarget {
  to: RideDestination;
  /** Known starting point (for the estimate), e.g. the arrival airport. */
  from?: { lat: number; lng: number };
  purpose: "hotel" | "airport" | "venue" | "restaurant" | "station" | "meeting";
}

/** Saudi local "YYYY-MM-DDTHH:MM" → ms. */
const ksaMs = (local: string) => Date.parse(`${local.slice(0, 16)}:00+03:00`);
const ksaDay = (ms: number) => new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
export const inRideWindow = (startMs: number, endMs: number, now: number) => now >= startMs - RIDE_LEAD_MS && now <= endMs;

/** What a package needs for rides (kept small so it can be sent to the browser). */
export interface PackageRideInfo {
  cancelled: boolean;
  hotels: { nameAr: string; nameEn: string; lat?: number; lng?: number; checkIn: string; checkOut: string }[];
  arrival: { at: string; airport: string } | null;
  departure: { at: string; airport: string } | null;
}

const hotelDest = (h: PackageRideInfo["hotels"][number], ar: boolean): RideDestination | null =>
  typeof h.lat === "number" && typeof h.lng === "number" ? { lat: h.lat, lng: h.lng, name: ar ? h.nameAr : h.nameEn } : null;

/**
 * A package: before and on the arrival day, from the airport to the first hotel; during the trip,
 * to tonight's hotel; on the departure day, to the airport.
 */
export function packageRide(p: PackageRideInfo, now: number, ar: boolean): RideTarget | null {
  if (p.cancelled || !p.hotels.length) return null;
  const first = p.hotels[0];
  const start = p.arrival ? ksaMs(p.arrival.at) : ksaMs(`${first.checkIn}T12:00`);
  const end = p.departure ? ksaMs(p.departure.at) : ksaMs(`${p.hotels[p.hotels.length - 1].checkOut}T12:00`);
  if (!inRideWindow(start, end, now)) return null;
  const today = ksaDay(now);
  if (p.departure && today === p.departure.at.slice(0, 10) && AIRPORTS[p.departure.airport]) {
    return { to: { ...AIRPORTS[p.departure.airport], name: ar ? `مطار ${p.departure.airport}` : `${p.departure.airport} airport` }, purpose: "airport" };
  }
  if (now < start || today === first.checkIn) {
    const to = hotelDest(first, ar);
    const ap = p.arrival ? AIRPORTS[p.arrival.airport] : undefined;
    return to ? { to, ...(ap ? { from: ap } : {}), purpose: "hotel" } : null;
  }
  const tonight = p.hotels.find((h) => h.checkIn <= today && today < h.checkOut) ?? p.hotels[p.hotels.length - 1];
  const to = hotelDest(tonight, ar);
  return to ? { to, purpose: "hotel" } : null;
}

/** An event ticket: to the venue, from the day before until the show ends. */
export function eventRide(o: { status: string; session: { start: string }; event: { lat: number; lng: number; venueAr: string; venueEn: string; durationMins: number } }, now: number, ar: boolean): RideTarget | null {
  if (o.status !== "CONFIRMED") return null;
  const start = Date.parse(o.session.start);
  if (!inRideWindow(start, start + o.event.durationMins * 60_000, now)) return null;
  return { to: { lat: o.event.lat, lng: o.event.lng, name: ar ? o.event.venueAr : o.event.venueEn }, purpose: "venue" };
}

/** A restaurant table: to the restaurant, until two hours after the booking time. */
export function tableRide(b: { status: string; start: string; restaurant: { lat: number; lng: number; nameAr: string; nameEn: string } }, now: number, ar: boolean): RideTarget | null {
  if (b.status !== "CONFIRMED") return null;
  const start = Date.parse(b.start);
  if (!inRideWindow(start, start + 2 * 3_600_000, now)) return null;
  return { to: { lat: b.restaurant.lat, lng: b.restaurant.lng, name: ar ? b.restaurant.nameAr : b.restaurant.nameEn }, purpose: "restaurant" };
}

/** A train ticket: to the departure station of the next leg, until it leaves. */
export function trainRide(
  o: { status: string; legs: { trip: { from: string; depart: string } }[] },
  stations: { code: string; lat: number; lng: number; nameAr: string; nameEn: string }[],
  now: number, ar: boolean,
): RideTarget | null {
  if (o.status !== "CONFIRMED") return null;
  const leg = o.legs.find((l) => inRideWindow(Date.parse(l.trip.depart), Date.parse(l.trip.depart), now));
  const st = leg && stations.find((s) => s.code === leg.trip.from);
  return st ? { to: { lat: st.lat, lng: st.lng, name: ar ? st.nameAr : st.nameEn }, purpose: "station" } : null;
}

/** A confirmed guide tour: to the meeting point (when the guide gave its location), until the tour ends. */
export function guideRide(g: { status: string; date: string; startTime: string; hours: number; meetingPoint?: { text: string; lat: number | null; lng: number | null } | null; guide: { nameAr: string; nameEn: string } }, now: number, ar: boolean): RideTarget | null {
  if (g.status !== "confirmed" || !g.meetingPoint || g.meetingPoint.lat === null || g.meetingPoint.lng === null) return null;
  const start = ksaMs(`${g.date}T${g.startTime}`);
  if (!inRideWindow(start, start + g.hours * 3_600_000, now)) return null;
  const name = g.meetingPoint.text || (ar ? `لقاء ${g.guide.nameAr}` : `Meeting ${g.guide.nameEn}`);
  return { to: { lat: g.meetingPoint.lat, lng: g.meetingPoint.lng, name }, purpose: "meeting" };
}

/** The ride data of a stored package (server side, sent with the booking row). */
export function packageRideInfo(b: {
  status: string; mt: { packageStatus: string | null };
  hotels: { nameAr: string; nameEn: string; lat?: number; lng?: number; checkIn: string; checkOut: string }[];
  flights: { kind: string; from: string; to: string; departAt: string; arriveAt: string }[];
}): PackageRideInfo {
  const out = b.flights.find((f) => f.kind === "outbound");
  const ret = b.flights.find((f) => f.kind === "return");
  return {
    cancelled: b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED",
    hotels: [...b.hotels].sort((x, y) => x.checkIn.localeCompare(y.checkIn)).map((h) => ({ nameAr: h.nameAr, nameEn: h.nameEn, lat: h.lat, lng: h.lng, checkIn: h.checkIn, checkOut: h.checkOut })),
    arrival: out ? { at: out.arriveAt, airport: out.to } : null,
    departure: ret ? { at: ret.departAt, airport: ret.from } : null,
  };
}
