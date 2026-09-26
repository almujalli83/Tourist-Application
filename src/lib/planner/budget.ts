/**
 * Rough budget of a plan (before booking): typical fares and room rates per budget tier, food per
 * person per day, the tickets suggested in the plan and the visa + insurance fee. Real prices come
 * from the package search after the plan is approved.
 */
import { PACKAGE_LIMITS } from "../config";
import type { CabinClass, RoomOccupancy } from "../types";
import type { BudgetTier, PlanBudget, PlanDay, PlanRequest } from "./types";

const INTL_FARE: Record<CabinClass, number> = { economy: 1800, premium: 2900, business: 5400, first: 9000 };
const DOMESTIC_FARE: Record<CabinClass, number> = { economy: 450, premium: 600, business: 900, first: 900 };
const ROOM_NIGHT: Record<BudgetTier, number> = { economy: 450, comfort: 800, luxury: 1600 };
const FOOD_DAY: Record<BudgetTier, number> = { economy: 120, comfort: 250, luxury: 500 };
/** Destinations priced above the average (resort-only or limited hotel stock). */
const CITY_FACTOR: Record<string, number> = { ULH: 1.8, RSI: 2.5, NUM: 2, MED: 1.2 };

const round10 = (n: number) => Math.round(n / 10) * 10;

export function partyOf(rooms: RoomOccupancy[]) {
  const ages = rooms.flatMap((r) => r.childAges);
  return {
    adults: rooms.reduce((a, r) => a + r.adults, 0),
    children: ages.filter((a) => a >= 2).length,
    infants: ages.filter((a) => a < 2).length,
    /** Adults for the package minimum (18+), and every traveller for the visa. */
    travellers: rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0),
    youngest: ages.length ? Math.min(...ages) : null,
    minorsAsAdults: ages.filter((a) => a >= 12).length,
  };
}

export function estimateBudget(req: Pick<PlanRequest, "rooms" | "cabin" | "budgetTier" | "maxBudgetSAR">, stays: { city: string; nights: number }[], days: PlanDay[], visaFeePerTravellerSAR: number): PlanBudget {
  const p = partyOf(req.rooms);
  // Fares: 12+ pay the adult fare, 2–11 about 75 %, infants about 10 %.
  const fareUnits = p.adults + p.minorsAsAdults + (p.children - p.minorsAsAdults) * 0.75 + p.infants * 0.1;
  const legs = Math.max(0, stays.length - 1);
  const flightsSAR = round10(fareUnits * (INTL_FARE[req.cabin] + legs * DOMESTIC_FARE[req.cabin]));
  const hotelsSAR = round10(stays.reduce((a, s) => a + s.nights * req.rooms.length * ROOM_NIGHT[req.budgetTier] * (CITY_FACTOR[s.city] ?? 1), 0));
  const nights = stays.reduce((a, s) => a + s.nights, 0);
  const foodSAR = round10((p.adults + p.children * 0.5) * (nights + 1) * FOOD_DAY[req.budgetTier]);
  const activitiesSAR = round10(days.reduce((a, d) => a + d.items.reduce((b, i) => b + (i.costSAR ?? 0), 0), 0));
  const visaSAR = Math.round(p.travellers * visaFeePerTravellerSAR * 100) / 100;
  const totalSAR = round10(flightsSAR + hotelsSAR + foodSAR + activitiesSAR + visaSAR);
  return {
    flightsSAR, hotelsSAR, activitiesSAR, foodSAR, visaSAR, totalSAR,
    packageMinSAR: p.adults * PACKAGE_LIMITS.minPricePerAdultSAR,
    overBudget: !!req.maxBudgetSAR && totalSAR > req.maxBudgetSAR,
  };
}

/** Re-prices the activities after an edit (the rest of the estimate does not change). */
export function withActivities(b: PlanBudget, days: PlanDay[], maxBudgetSAR: number | null): PlanBudget {
  const activitiesSAR = round10(days.reduce((a, d) => a + d.items.reduce((s, i) => s + (i.costSAR ?? 0), 0), 0));
  const totalSAR = round10(b.totalSAR - b.activitiesSAR + activitiesSAR);
  return { ...b, activitiesSAR, totalSAR, overBudget: !!maxBudgetSAR && totalSAR > maxBudgetSAR };
}
