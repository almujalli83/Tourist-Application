/**
 * Key package requirements (MT "Key Package Requirements" v1.3), checked before the visa form
 * is opened and again when the booking is created.
 */
import { PACKAGE_LIMITS } from "./config";
import { ageOn, diffDays, isValidISODate } from "./dates";
import { buildLegs } from "./itinerary";
import type { FlightOffer, HotelOffer, SearchCriteria, Traveller } from "./types";

export type RequirementId = "duration" | "leadTime" | "composition" | "flights" | "hotels" | "minPrice";

export interface RequirementCheck {
  id: RequirementId;
  ok: boolean;
}

export interface PackageCheck {
  checks: RequirementCheck[];
  ok: boolean;
  days: number;
  /** Adults (18+) the minimum price is computed for. */
  adults: number;
  /** True when `adults` comes from the travellers' birth dates rather than the search. */
  adultsFromAges: boolean;
  minPriceSAR: number;
  totalSAR: number;
  shortfallSAR: number;
}

/** Package length in days, counted as in the search (departure to return date). */
export function packageDays(c: SearchCriteria): number {
  return diffDays(c.departureDate, c.returnDate);
}

/** 2,000 SAR per adult for the minimum duration, plus 1,000 SAR per adult for each additional day. */
export function minimumPackagePrice(adults: number, days: number): number {
  const extraDays = Math.max(0, days - PACKAGE_LIMITS.minPackageDays);
  return adults * (PACKAGE_LIMITS.minPricePerAdultSAR + extraDays * PACKAGE_LIMITS.extraDayPerAdultSAR);
}

/**
 * Adults counted in the minimum price. Minors (under 18) are not counted; until every
 * traveller's birth date is known, all flight "adults" (12+) are counted.
 */
export function adultsForPricing(c: SearchCriteria, travellers: Pick<Traveller, "birthDate">[] = [], on = c.departureDate) {
  const known = travellers.length > 0 && travellers.every((t) => isValidISODate(t.birthDate));
  if (!known) return { adults: c.pax.adults, fromAges: false };
  return { adults: travellers.filter((t) => ageOn(t.birthDate, on) >= PACKAGE_LIMITS.minorAgeLimit).length, fromAges: true };
}

export function checkPackageRequirements(input: {
  criteria: SearchCriteria;
  flights: FlightOffer[];
  hotels: HotelOffer[];
  totalSAR: number;
  today: string;
  travellers?: Pick<Traveller, "birthDate">[];
  arrivalDate?: string;
}): PackageCheck {
  const { criteria: c, flights, hotels, totalSAR, today } = input;
  const days = packageDays(c);
  const lead = diffDays(today, c.departureDate);
  const { adults, fromAges } = adultsForPricing(c, input.travellers, input.arrivalDate ?? c.departureDate);
  const minPriceSAR = minimumPackagePrice(adults, days);
  const legs = buildLegs(c);
  const minors = c.pax.children + c.pax.infants;

  const checks: RequirementCheck[] = [
    { id: "duration", ok: days >= PACKAGE_LIMITS.minPackageDays && days <= PACKAGE_LIMITS.maxPackageDays },
    { id: "leadTime", ok: lead >= PACKAGE_LIMITS.minLeadDays && lead <= PACKAGE_LIMITS.maxLeadDays },
    {
      id: "composition",
      ok: c.pax.adults >= 1 && c.pax.adults <= PACKAGE_LIMITS.maxAdults && minors <= PACKAGE_LIMITS.maxMinors,
    },
    { id: "flights", ok: legs.every((l) => flights.some((f) => f.legIndex === l.index)) },
    {
      id: "hotels",
      ok: c.stays.every((s) => hotels.some((h) => h.city === s.city && h.stars >= PACKAGE_LIMITS.minHotelStars && !!h.licenseNo)),
    },
    { id: "minPrice", ok: totalSAR >= minPriceSAR },
  ];
  return {
    checks,
    ok: checks.every((x) => x.ok),
    days,
    adults,
    adultsFromAges: fromAges,
    minPriceSAR,
    totalSAR,
    shortfallSAR: Math.max(0, Math.round((minPriceSAR - totalSAR) * 100) / 100),
  };
}
