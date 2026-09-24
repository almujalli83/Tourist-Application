import { addDays, diffDays, isValidISODate } from "./dates";
import { PACKAGE_LIMITS } from "./config";
import { getCity, getSaudiCity } from "./data/cities";
import { getCountry } from "./data/countries";
import type { CityStay, FlightLeg, PaxCount, SearchCriteria } from "./types";

/**
 * Builds the flight legs of a package: international outbound to the first city,
 * one domestic flight between each consecutive city, and the international return.
 */
export function buildLegs(c: SearchCriteria): FlightLeg[] {
  const legs: FlightLeg[] = [];
  const first = c.stays[0];
  const last = c.stays[c.stays.length - 1];
  legs.push({ index: 0, kind: "outbound", from: c.origin, to: first.city, date: c.departureDate });
  let date = c.departureDate;
  for (let i = 0; i < c.stays.length - 1; i++) {
    date = addDays(date, c.stays[i].nights);
    legs.push({ index: legs.length, kind: "domestic", from: c.stays[i].city, to: c.stays[i + 1].city, date });
  }
  legs.push({ index: legs.length, kind: "return", from: last.city, to: c.origin, date: c.returnDate });
  return legs;
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
  | "maxAdults"
  | "maxMinors"
  | "infants"
  | "nationality";

export function validateCriteria(c: SearchCriteria, today: string): SearchError[] {
  const errors: SearchError[] = [];
  if (!getCity(c.origin) || getSaudiCity(c.origin)) errors.push("origin");
  if (c.stays.length === 0 || c.stays.some((s) => !getSaudiCity(s.city) || !(s.nights >= 1)))
    errors.push("cities");
  if (!isValidISODate(c.departureDate) || !isValidISODate(c.returnDate)) {
    errors.push("dates");
  } else {
    const lead = diffDays(today, c.departureDate);
    if (lead < PACKAGE_LIMITS.minLeadDays || lead > PACKAGE_LIMITS.maxLeadDays) errors.push("leadTime");
    const nights = diffDays(c.departureDate, c.returnDate);
    if (nights < PACKAGE_LIMITS.minPackageDays || nights > PACKAGE_LIMITS.maxPackageDays) errors.push("duration");
    else if (c.stays.reduce((a, s) => a + s.nights, 0) !== nights) errors.push("nightsMismatch");
  }
  const { adults, children, infants } = c.pax;
  if (![adults, children, infants].every((n) => Number.isInteger(n) && n >= 0) || adults < 1) errors.push("pax");
  if (adults > PACKAGE_LIMITS.maxAdults) errors.push("maxAdults");
  if (children + infants > PACKAGE_LIMITS.maxMinors) errors.push("maxMinors");
  if (infants > adults) errors.push("infants");
  if (!getCountry(c.nationality)) errors.push("nationality");
  return errors;
}
