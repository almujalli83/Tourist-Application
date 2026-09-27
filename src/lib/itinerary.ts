import { addDays, diffDays, isValidISODate } from "./dates";
import { PACKAGE_LIMITS } from "./config";
import { paxFromRooms, validateRooms } from "./occupancy";
import { airportOf, getCity, getSaudiCity, getStayCity, UMRAH_CITY } from "./data/cities";
import { getCountry } from "./data/countries";
import type { CityStay, FlightLeg, PaxCount, SearchCriteria } from "./types";

/**
 * Builds the flight legs of a package: international outbound to the first city,
 * one domestic flight between consecutive cities (none when they share an airport), and the return.
 */
export function buildLegs(c: SearchCriteria): FlightLeg[] {
  const legs: FlightLeg[] = [];
  const first = c.stays[0];
  const last = c.stays[c.stays.length - 1];
  // Flights use each city's airport (Makkah → Jeddah); cities sharing an airport are a ground transfer.
  legs.push({ index: 0, kind: "outbound", from: c.origin, to: airportOf(first.city), date: c.departureDate });
  let date = c.departureDate;
  for (let i = 0; i < c.stays.length - 1; i++) {
    date = addDays(date, c.stays[i].nights);
    const from = airportOf(c.stays[i].city);
    const to = airportOf(c.stays[i + 1].city);
    if (from !== to) legs.push({ index: legs.length, kind: "domestic", from, to, date });
  }
  legs.push({ index: legs.length, kind: "return", from: airportOf(last.city), to: c.origin, date: c.returnDate });
  return legs;
}

/** Road/rail transfers the package includes instead of a flight (e.g. Jeddah airport ↔ Makkah). */
export function groundTransfers(c: SearchCriteria): { from: string; to: string; date: string }[] {
  const out: { from: string; to: string; date: string }[] = [];
  const first = c.stays[0];
  const last = c.stays[c.stays.length - 1];
  if (airportOf(first.city) !== first.city) out.push({ from: airportOf(first.city), to: first.city, date: c.departureDate });
  let date = c.departureDate;
  for (let i = 0; i < c.stays.length - 1; i++) {
    date = addDays(date, c.stays[i].nights);
    const a = c.stays[i].city;
    const b = c.stays[i + 1].city;
    if (airportOf(a) === airportOf(b)) out.push({ from: a, to: b, date });
    else {
      if (airportOf(a) !== a) out.push({ from: a, to: airportOf(a), date });
      if (airportOf(b) !== b) out.push({ from: airportOf(b), to: b, date });
    }
  }
  if (airportOf(last.city) !== last.city) out.push({ from: last.city, to: airportOf(last.city), date: c.returnDate });
  return out;
}

/** Check-in / check-out dates for each city stay. */
export function stayDates(c: SearchCriteria): { city: string; checkIn: string; checkOut: string; nights: number }[] {
  let date = c.departureDate;
  return c.stays.map((s) => {
    const checkIn = date;
    date = addDays(date, s.nights);
    return { city: s.city, checkIn, checkOut: date, nights: s.nights };
  });
}

/** Splits the total nights across cities as evenly as possible (earlier cities get the remainder). */
export function splitNights(cities: string[], totalNights: number): CityStay[] {
  if (cities.length === 0) return [];
  const base = Math.floor(totalNights / cities.length);
  const extra = totalNights % cities.length;
  return cities.map((city, i) => ({ city, nights: Math.max(1, base + (i < extra ? 1 : 0)) }));
}

export function totalPax(p: PaxCount): number {
  return p.adults + p.children + p.infants;
}

export type SearchError =
  | "origin"
  | "cities"
  | "dates"
  | "leadTime"
  | "duration"
  | "nightsMismatch"
  | "pax"
  | "rooms"
  | "childAges"
  | "maxAdults"
  | "maxMinors"
  | "infants"
  | "nationality";

export function validateCriteria(c: SearchCriteria, today: string): SearchError[] {
  const errors: SearchError[] = [];
  if (!getCity(c.origin) || getSaudiCity(c.origin)) errors.push("origin");
  if (c.stays.length === 0 || c.stays.some((s) => !getStayCity(s.city) || !(s.nights >= 1)))
    errors.push("cities");
  // Makkah only with the Umrah option (Muslim declaration).
  if (c.stays.some((s) => s.city === UMRAH_CITY) && c.umrah !== true) errors.push("cities");
  if (!isValidISODate(c.departureDate) || !isValidISODate(c.returnDate)) {
    errors.push("dates");
  } else {
    const lead = diffDays(today, c.departureDate);
    if (lead < PACKAGE_LIMITS.minLeadDays || lead > PACKAGE_LIMITS.maxLeadDays) errors.push("leadTime");
    const nights = diffDays(c.departureDate, c.returnDate);
    if (nights < PACKAGE_LIMITS.minPackageDays || nights > PACKAGE_LIMITS.maxPackageDays) errors.push("duration");
    else if (c.stays.reduce((a, s) => a + s.nights, 0) !== nights) errors.push("nightsMismatch");
  }
  // Guests: adults (18+) and children's ages per room; fare categories must follow from them.
  const roomErrors = validateRooms(c.rooms);
  errors.push(...roomErrors);
  if (!roomErrors.length) {
    const expected = paxFromRooms(c.rooms);
    if (!c.pax || c.pax.adults !== expected.adults || c.pax.children !== expected.children || c.pax.infants !== expected.infants)
      errors.push("pax");
  }
  if (!getCountry(c.nationality)) errors.push("nationality");
  return errors;
}
