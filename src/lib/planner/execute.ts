/**
 * Carrying out an approved plan: the system picks the package (flights, licensed hotels of the
 * plan's budget level, package activities up to the minimum price) and prepares the plan's event
 * tickets and table bookings, which are bought with the package in the same payment.
 */
import { searchActivities, searchFlights, searchHotels } from "../agents/aggregator";
import type { CardInput } from "../payment";
import type { PublicUser } from "../auth/types";
import { PACKAGE_LIMITS, VISA_INSURANCE_FEE_SAR } from "../config";
import { addDays, todayISO } from "../dates";
import { availability as eventAvailability, EventOrderError, getEvent, holdTickets, openSessions, orderIdFor, placeOrder } from "../events/orders";
import type { EventItem } from "../events/types";
import { buildLegs, stayDates, validateCriteria } from "../itinerary";
import { checkPackageRequirements } from "../package-rules";
import { computePackagePrice } from "../pricing";
import { availability as tableAvailability, bookingIdFor, bookTable, feeFor, holdTable, RestaurantBookingError } from "../restaurants/bookings";
import { BOOKING_DAYS_AHEAD, getRestaurant } from "../restaurants/catalog";
import type { ActivityOffer, FlightLeg, FlightOffer, HotelOffer, SearchCriteria } from "../types";
import { CITY_CENTERS } from "../guide/centers";
import { partyOf } from "./budget";
import { flightTimesFrom, scheduleDay, type FlightTimes } from "./schedule";
import { planCriteria } from "./handoff";
import type { BudgetTier, Interest, TripPlan } from "./types";

/* ------------------------------------------------------------------ package */

export type AutoNote =
  | { code: "hotelTier"; city: string; stars: number; wanted: number }
  | { code: "budgetDowngrade"; stars: number }
  | { code: "addedActivities"; count: number }
  | { code: "overBudget"; totalSAR: number; maxSAR: number }
  | { code: "noOffers"; what: "flights" | "hotels" }
  | { code: "arrivalAdjusted"; time: string };

export interface AutoSelection {
  criteria: SearchCriteria;
  flightResults: { leg: FlightLeg; offers: FlightOffer[]; failedAgents: string[] }[];
  hotelResults: { stay: ReturnType<typeof stayDates>[number]; offers: HotelOffer[]; failedAgents: string[] }[];
  activityResults: { stay: ReturnType<typeof stayDates>[number]; offers: ActivityOffer[] }[];
  flights: Record<number, string>;
  hotels: Record<string, string>;
  activities: string[];
  packageTotalSAR: number;
  notes: AutoNote[];
  /** Times of the chosen flights, which the plan's days are fitted to. */
  flightTimes: FlightTimes | null;
}

export class ExecuteError extends Error {
  constructor(code: string, public details?: unknown) {
    super(code);
  }
}

const TIER_STARS: Record<BudgetTier, number> = { economy: 3, comfort: 4, luxury: 5 };
const hhmm = (iso: string) => iso.slice(11, 16);

/** Flight score (lower is better): price, stops, and times that fit the plan's days. */
function flightScore(o: FlightOffer): number {
  let s = o.totalSAR * (1 + 0.2 * o.stops);
  const arr = hhmm(o.arriveAt);
  const dep = hhmm(o.departAt);
  if (o.kind === "outbound" && arr > "16:00") s *= 1.1; // the arrival day's programme starts at 16:00
  if (o.kind === "return" && dep < "12:00") s *= 1.1; // the departure morning can hold a visit
  if (o.kind === "domestic" && (dep < "08:00" || dep > "13:30")) s *= 1.1; // the new city's afternoon is planned
  return s;
}
export const pickFlight = (offers: FlightOffer[]) => [...offers].sort((a, b) => flightScore(a) - flightScore(b))[0] ?? null;

/** Licensed hotel of the wanted class (or the nearest class), best reviewed among the good-value ones. */
export function pickHotel(offers: HotelOffer[], wanted: number): HotelOffer | null {
  const ok = offers.filter((h) => h.stars >= PACKAGE_LIMITS.minHotelStars && h.licenseNo);
  if (!ok.length) return null;
  const classes = [...new Set(ok.map((h) => h.stars))].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || (wanted >= 5 ? b - a : a - b));
  const group = ok.filter((h) => h.stars === classes[0]);
  const cheapest = Math.min(...group.map((h) => h.totalSAR));
  return group.filter((h) => h.totalSAR <= cheapest * 1.25).sort((a, b) => b.reviewScore - a.reviewScore || a.totalSAR - b.totalSAR)[0];
}

const ACTIVITY_INTEREST: Record<ActivityOffer["kind"], Interest[]> = {
  event: ["entertainment", "adventure"], tour: ["heritage", "culture", "nature", "adventure", "religious"], restaurant: ["food"],
};

function packagePrice(criteria: SearchCriteria, flights: FlightOffer[], hotels: HotelOffer[], activities: ActivityOffer[]) {
  return computePackagePrice({ pax: criteria.pax, flights, hotels, activities, visaFeeSAR: VISA_INSURANCE_FEE_SAR }).totalSAR;
}

export async function autoSelect(plan: TripPlan, extrasSAR = 0): Promise<AutoSelection> {
  const criteria = planCriteria(plan);
  const errs = validateCriteria(criteria, todayISO());
  if (errs.length) throw new ExecuteError("invalidCriteria");
  const legs = buildLegs(criteria);
  const stays = stayDates(criteria);
  const [fl, ho, ac] = await Promise.all([
    Promise.all(legs.map((leg) => searchFlights({ leg, pax: criteria.pax, cabin: criteria.cabin }))),
    Promise.all(stays.map((s) => searchHotels({ city: s.city, checkIn: s.checkIn, checkOut: s.checkOut, pax: criteria.pax, rooms: criteria.rooms }))),
    Promise.all(stays.map((s) => searchActivities({ city: s.city, from: s.checkIn, to: s.checkOut, pax: criteria.pax }))),
  ]);
  const notes: AutoNote[] = [];
  const flights = legs.map((_, i) => pickFlight(fl[i].offers));
  // No flight for a date of the plan: the traveller chooses nearby dates (the plan is not moved silently).
  if (flights.some((f) => !f)) throw new ExecuteError("noFlights", { alternatives: await alternativeDates(plan) });
  const wanted = TIER_STARS[plan.request.budgetTier];
  let hotels = stays.map((_, i) => pickHotel(ho[i].offers, wanted));
  if (hotels.some((h) => !h)) throw new ExecuteError("noHotels");
  hotels.forEach((h, i) => {
    if (h!.stars !== wanted) notes.push({ code: "hotelTier", city: stays[i].city, stars: h!.stars, wanted });
  });

  // Over the traveller's budget: one class lower (not below the package's 3 stars).
  const max = plan.request.maxBudgetSAR;
  let total = packagePrice(criteria, flights as FlightOffer[], hotels as HotelOffer[], []);
  if (max && total + extrasSAR > max && wanted > PACKAGE_LIMITS.minHotelStars) {
    const lower = stays.map((_, i) => pickHotel(ho[i].offers, wanted - 1));
    if (lower.every(Boolean)) {
      const lowerTotal = packagePrice(criteria, flights as FlightOffer[], lower as HotelOffer[], []);
      if (lowerTotal < total) {
        hotels = lower;
        total = lowerTotal;
        notes.push({ code: "budgetDowngrade", stars: wanted - 1 });
      }
    }
  }

  // The package must reach 2,000 SAR per adult: add package activities that fit the interests.
  const activities: ActivityOffer[] = [];
  const minSAR = partyOf(criteria.rooms).adults * PACKAGE_LIMITS.minPricePerAdultSAR;
  const pool = ac.flatMap((r) => r.offers)
    .map((o) => ({ o, fit: ACTIVITY_INTEREST[o.kind].filter((i) => plan.request.interests.includes(i)).length }))
    .sort((a, b) => b.fit - a.fit);
  while (total < minSAR && pool.length) {
    const gap = minSAR - total;
    const bestFit = pool[0].fit;
    const candidates = pool.filter((x) => x.fit === bestFit);
    // The smallest activity that closes the gap, otherwise the largest one.
    const closing = candidates.filter((x) => x.o.totalSAR >= gap).sort((a, b) => a.o.totalSAR - b.o.totalSAR)[0];
    const next = closing ?? candidates.sort((a, b) => b.o.totalSAR - a.o.totalSAR)[0];
    pool.splice(pool.indexOf(next), 1);
    activities.push(next.o);
    total = packagePrice(criteria, flights as FlightOffer[], hotels as HotelOffer[], activities);
  }
  if (activities.length) notes.push({ code: "addedActivities", count: activities.length });
  if (max && total + extrasSAR > max) notes.push({ code: "overBudget", totalSAR: Math.round(total + extrasSAR), maxSAR: max });

  const times = flightTimesFrom(flights as FlightOffer[]);
  const rules = checkPackageRequirements({ criteria, flights: flights as FlightOffer[], hotels: hotels as HotelOffer[], totalSAR: total, today: todayISO() });
  if (!rules.ok) throw new ExecuteError(`requirements:${rules.checks.filter((c) => !c.ok).map((c) => c.id).join(",")}`);

  return {
    criteria,
    flightResults: legs.map((leg, i) => ({ leg, offers: fl[i].offers, failedAgents: fl[i].failedAgents })),
    hotelResults: stays.map((stay, i) => ({ stay, offers: ho[i].offers, failedAgents: ho[i].failedAgents })),
    activityResults: stays.map((stay, i) => ({ stay, offers: ac[i].offers })),
    flights: Object.fromEntries(flights.map((f) => [f!.legIndex, f!.id])),
    hotels: Object.fromEntries(hotels.map((h) => [h!.city, h!.id])),
    activities: activities.map((a) => a.id),
    packageTotalSAR: Math.round(total * 100) / 100,
    notes: [...notes, ...(times && times.arriveAt.slice(11, 16) > "16:00" ? [{ code: "arrivalAdjusted" as const, time: times.arriveAt.slice(11, 16) }] : [])],
    flightTimes: times,
  };
}

/** Nearby arrival dates (±1–3 days, same length) on which every flight of the plan is available. */
export async function alternativeDates(plan: TripPlan, max = 3): Promise<{ departureDate: string; returnDate: string }[]> {
  const out: { departureDate: string; returnDate: string }[] = [];
  const base = planCriteria(plan);
  for (const delta of [1, -1, 2, -2, 3, -3]) {
    if (out.length >= max) break;
    const c: SearchCriteria = { ...base, departureDate: addDays(base.departureDate, delta), returnDate: addDays(base.returnDate, delta) };
    if (validateCriteria(c, todayISO()).length) continue;
    const results = await Promise.all(buildLegs(c).map((leg) => searchFlights({ leg, pax: c.pax, cabin: c.cabin })));
    if (results.every((r) => r.offers.length)) out.push({ departureDate: c.departureDate, returnDate: c.returnDate });
  }
  return out.sort((a, b) => a.departureDate.localeCompare(b.departureDate));
}

/* ------------------------------------------------------------------ plan extras */

export interface ExtraEvent {
  itemId: string; key: string; eventId: string; sessionId: string; date: string; time: string; titleAr: string; titleEn: string;
  seats?: string[]; quantities?: Record<string, number>; tickets: number; totalSAR: number;
}
export interface ExtraTable {
  itemId: string; key: string; restaurantId: string; day: string; time: string; party: number; feeSAR: number; titleAr: string; titleEn: string; meal: "lunch" | "dinner";
}
export interface ExtraIssue { itemId: string; titleAr: string; titleEn: string; reason: "soldOut" | "closed" | "tooFar" | "full" | "tooMany" | "flightConflict" }
export interface PlanExtras { events: ExtraEvent[]; tables: ExtraTable[]; issues: ExtraIssue[]; totalSAR: number; heldUntil?: number | null }

const round2 = (n: number) => Math.round(n * 100) / 100;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Seats next to each other in the cheapest section that has them (any free seats of a section otherwise). */
function pickSeats(e: EventItem, unavailable: Set<string>, n: number): string[] | null {
  const sections = [...(e.sections ?? [])].sort((a, b) => a.priceSAR - b.priceSAR);
  for (const s of sections) {
    for (let r = 0; r < s.rows; r++) {
      const row = String.fromCharCode(65 + r);
      for (let start = 1; start + n - 1 <= s.seatsPerRow; start++) {
        const ids = Array.from({ length: n }, (_, k) => `${s.id}-${row}${start + k}`);
        if (ids.every((id) => !unavailable.has(id))) return ids;
      }
    }
  }
  for (const s of sections) {
    const free: string[] = [];
    for (let r = 0; r < s.rows && free.length < n; r++)
      for (let k = 1; k <= s.seatsPerRow && free.length < n; k++) {
        const id = `${s.id}-${String.fromCharCode(65 + r)}${k}`;
        if (!unavailable.has(id)) free.push(id);
      }
    if (free.length === n) return free;
  }
  return null;
}

/** Tickets for the party: child tickets for children when the event sells them, adult ones otherwise. */
function pickQuantities(e: EventItem, ages: number[], adults: number, remaining: Record<string, number>): Record<string, number> | null {
  const types = e.ticketTypes ?? [];
  const child = types.find((t) => t.id === "child");
  const adult = types.find((t) => t.id !== "child") ?? child;
  if (!adult) return null;
  const q: Record<string, number> = {};
  const add = (id: string) => (q[id] = (q[id] ?? 0) + 1);
  for (let i = 0; i < adults; i++) add(adult.id);
  for (const age of ages) add(child && age <= 12 ? child.id : adult.id);
  return Object.entries(q).every(([id, n]) => (remaining[id] ?? 0) >= n) ? q : null;
}

/**
 * The plan's tickets and tables for the party. With the booked `flights`, activities that clash
 * with them are left out; with `userId`, the traveller's own temporary holds don't count as taken.
 */
export async function planExtras(plan: TripPlan, now = new Date(), opts: { flights?: FlightTimes | null; userId?: string } = {}): Promise<PlanExtras> {
  const party = partyOf(plan.request.rooms);
  const ages = plan.request.rooms.flatMap((r) => r.childAges).filter((a) => a >= 2); // infants go on a lap
  const kids = party.youngest !== null;
  const out: PlanExtras = { events: [], tables: [], issues: [], totalSAR: 0 };
  const lastBookable = addDays(todayISO(), BOOKING_DAYS_AHEAD);
  for (const day of plan.days) {
    // The table is booked for the time the day's schedule gives the meal (moved around events and prayers).
    const schedule = scheduleDay(day, { pace: plan.request.pace, prayer: plan.request.prayer, kids, flights: opts.flights }, CITY_CENTERS[day.city] ?? CITY_CENTERS.RUH);
    for (const item of day.items) {
      const base = { itemId: item.id, titleAr: item.titleAr, titleEn: item.titleEn };
      if ((item.kind === "event" || item.kind === "restaurant") && schedule.find((e) => e.item?.id === item.id)?.warnings.includes("flight")) {
        out.issues.push({ ...base, reason: "flightConflict" });
        continue;
      }
      if (item.kind === "event") {
        const [eventId, when = ""] = item.ref.slice("event:".length).split("@");
        const e = await getEvent(eventId, { from: day.date, to: day.date });
        const session = e ? openSessions(e, now).find((s) => new Date(Date.parse(s.start) + 3 * 3_600_000).toISOString().slice(0, 16) === when) : undefined;
        if (!e || !session) {
          out.issues.push({ ...base, reason: "closed" });
          continue;
        }
        const count = party.adults + ages.length;
        if (count > e.maxPerOrder) {
          out.issues.push({ ...base, reason: "tooMany" });
          continue;
        }
        const key = `plan:${plan.id}:${item.id}:${session.id}`;
        const avail = await eventAvailability(e, session.id, { now: now.getTime(), except: opts.userId ? orderIdFor(opts.userId, key) : undefined });
        const ev: ExtraEvent = { ...base, key, eventId, sessionId: session.id, date: day.date, time: when.slice(11, 16), tickets: count, totalSAR: 0 };
        if (e.seating === "seated") {
          const seats = pickSeats(e, new Set(avail.unavailable), count);
          if (!seats) {
            out.issues.push({ ...base, reason: "soldOut" });
            continue;
          }
          ev.seats = seats;
          ev.totalSAR = round2(seats.reduce((a, s) => a + (e.sections!.find((x) => s.startsWith(`${x.id}-`))?.priceSAR ?? 0), 0));
        } else {
          const q = pickQuantities(e, ages, party.adults, avail.remaining);
          if (!q) {
            out.issues.push({ ...base, reason: "soldOut" });
            continue;
          }
          ev.quantities = q;
          ev.totalSAR = round2(Object.entries(q).reduce((a, [id, n]) => a + (e.ticketTypes!.find((t) => t.id === id)?.priceSAR ?? 0) * n, 0));
        }
        out.events.push(ev);
      } else if (item.kind === "restaurant") {
        const r = getRestaurant(item.ref.slice("restaurant:".length));
        if (!r) continue;
        if (day.date > lastBookable) {
          out.issues.push({ ...base, reason: "tooFar" });
          continue;
        }
        const size = Math.min(r.maxParty, party.adults + party.children + party.infants);
        const target = schedule.find((e) => e.item?.id === item.id)?.start ?? (item.meal === "lunch" ? 13 * 60 + 30 : kids ? 19 * 60 : 20 * 60 + 30);
        const key = `plan:${plan.id}:${item.id}:${day.date}`;
        const slot = (await tableAvailability(r, day.date, now, opts.userId ? bookingIdFor(opts.userId, key) : undefined))
          .filter((s) => s.bookable && s.left >= size && (item.meal === "lunch" ? toMin(s.time) < 17 * 60 : toMin(s.time) >= 17 * 60))
          .sort((a, b) => Math.abs(toMin(a.time) - target) - Math.abs(toMin(b.time) - target))[0];
        if (!slot) {
          out.issues.push({ ...base, reason: "full" });
          continue;
        }
        out.tables.push({ ...base, key, restaurantId: r.id, day: day.date, time: slot.time, party: size, feeSAR: feeFor(r, size), meal: item.meal === "lunch" ? "lunch" : "dinner" });
      }
    }
  }
  out.totalSAR = round2(out.events.reduce((a, e) => a + e.totalSAR, 0) + out.tables.reduce((a, t) => a + t.feeSAR, 0));
  return out;
}

export interface ExtrasResult {
  events: { itemId: string; titleAr: string; titleEn: string; orderId: string | null; error?: string }[];
  tables: { itemId: string; titleAr: string; titleEn: string; bookingId: string | null; error?: string }[];
}

/**
 * Buys the plan's event tickets and books its tables with the traveller's card, after the package
 * is paid. Each one is its own order (cancellable on its own); a failure doesn't undo the package.
 */
export async function bookPlanExtras(user: PublicUser, plan: TripPlan, extras: PlanExtras, card: CardInput, bookingId: string, now = new Date()): Promise<ExtrasResult> {
  const res: ExtrasResult = { events: [], tables: [] };
  for (const e of extras.events) {
    const base = { itemId: e.itemId, titleAr: e.titleAr, titleEn: e.titleEn };
    try {
      const order = await placeOrder(user, { eventId: e.eventId, sessionId: e.sessionId, seats: e.seats, quantities: e.quantities, expectedTotalSAR: e.totalSAR, idempotencyKey: e.key, card }, now);
      res.events.push({ ...base, orderId: order.id });
    } catch (err) {
      if (!(err instanceof EventOrderError)) console.error("plan event order failed", err);
      res.events.push({ ...base, orderId: null, error: err instanceof EventOrderError ? err.code : "generic" });
    }
  }
  for (const t of extras.tables) {
    const base = { itemId: t.itemId, titleAr: t.titleAr, titleEn: t.titleEn };
    try {
      const b = await bookTable(user, { restaurantId: t.restaurantId, day: t.day, time: t.time, party: t.party, expectedFeeSAR: t.feeSAR, idempotencyKey: t.key, card }, now);
      res.tables.push({ ...base, bookingId: b.id });
    } catch (err) {
      if (!(err instanceof RestaurantBookingError)) console.error("plan table booking failed", err);
      res.tables.push({ ...base, bookingId: null, error: err instanceof RestaurantBookingError ? err.code : "generic" });
    }
  }
  return res;
}

/** Same extras as when the traveller saw them (checked again before paying). */
/**
 * Holds the plan's seats / tickets and tables while the traveller completes the booking. Those that
 * can no longer be held move to the issues (and out of the amount to pay).
 */
export async function holdPlanExtras(user: PublicUser, extras: PlanExtras, minutes = HOLD_MINUTES): Promise<PlanExtras> {
  const out: PlanExtras = { ...extras, events: [], tables: [], issues: [...extras.issues] };
  let until = Infinity;
  for (const e of extras.events) {
    const h = await holdTickets(user, { eventId: e.eventId, sessionId: e.sessionId, seats: e.seats, quantities: e.quantities, idempotencyKey: e.key }, minutes);
    if (h.ok) {
      out.events.push(e);
      until = Math.min(until, h.until);
    } else out.issues.push({ itemId: e.itemId, titleAr: e.titleAr, titleEn: e.titleEn, reason: "soldOut" });
  }
  for (const t of extras.tables) {
    const h = await holdTable(user, { restaurantId: t.restaurantId, day: t.day, time: t.time, party: t.party, idempotencyKey: t.key }, minutes);
    if (h.ok) {
      out.tables.push(t);
      until = Math.min(until, h.until);
    } else out.issues.push({ itemId: t.itemId, titleAr: t.titleAr, titleEn: t.titleEn, reason: "full" });
  }
  out.totalSAR = round2(out.events.reduce((a, e) => a + e.totalSAR, 0) + out.tables.reduce((a, t) => a + t.feeSAR, 0));
  out.heldUntil = Number.isFinite(until) ? until : null;
  return out;
}

export const HOLD_MINUTES = 20;

export const extrasKey = (x: PlanExtras) => JSON.stringify([x.events.map((e) => [e.itemId, e.sessionId, e.totalSAR]), x.tables.map((t) => [t.itemId, t.day, t.time, t.feeSAR])]);
