import { describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";

vi.mock("@/lib/assistant/claude", () => ({ aiConfigured: () => false, askClaude: vi.fn(), AiUnavailableError: class extends Error {} }));

const { generatePlan } = await import("@/lib/planner/generate");
const { savePlan, updatePlanDays } = await import("@/lib/planner/plans");
const { autoSelect, bookPlanExtras, pickFlight, pickHotel, planExtras } = await import("@/lib/planner/execute");
const { loadPools } = await import("@/lib/planner/catalog");
const { evaluatePackage } = await import("@/lib/bookings/service");
const { listOrders } = await import("@/lib/events/orders");
const { listTableBookings } = await import("@/lib/restaurants/bookings");
const { addDays, todayISO } = await import("@/lib/dates");
import type { FlightOffer, HotelOffer } from "@/lib/types";

const run = Math.random().toString(36).slice(2, 8);
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const today = todayISO();
const card = { holder: "S A", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };

async function planWithExtras(u: PublicUser, rooms = [{ adults: 2, childAges: [7] }], budgetTier = "comfort") {
  const dep = addDays(today, 6);
  const { plan } = await generatePlan({ origin: "CAI", nationality: "EG", departureDate: dep, nights: 3, cities: ["RUH"], rooms, cabin: "economy", interests: ["heritage", "food"], pace: "moderate", budgetTier, maxBudgetSAR: null, prayer: false, accessible: false, notes: "" }, "ar", today);
  const saved = await savePlan(u, plan);
  // A general-admission event and a restaurant dinner on the second day.
  const day = saved.days[1];
  const pool = (await loadPools(["RUH"], day.date, day.date)).get("RUH")!;
  const ga = pool.events.find((e) => e.event.seating === "general" && !e.event.minAge && e.slots.some((s) => s.date === day.date))!;
  const slot = ga.slots.find((s) => s.date === day.date)!;
  const days = saved.days.map((d) => d.date === day.date
    ? { ...d, items: [{ ref: `event:${ga.event.id}@${slot.date}T${slot.time}`, note: "" }, { ref: "restaurant:ruh-olaya-lebanese", meal: "dinner", note: "" }] }
    : { ...d, items: [] });
  return { plan: await updatePlanDays(u, saved.id, days), event: ga.event };
}

describe("carrying out a plan", () => {
  it("picks flights that fit the plan's days and hotels of the budget level", () => {
    const f = (id: string, total: number, stops: number, arrive: string) => ({ id, kind: "outbound", totalSAR: total, stops, departAt: "2026-10-10T08:00", arriveAt: `2026-10-10T${arrive}` }) as FlightOffer;
    expect(pickFlight([f("a", 1000, 1, "12:00"), f("b", 1050, 0, "13:00"), f("c", 900, 0, "22:00")])!.id).toBe("c");
    expect(pickFlight([f("a", 1000, 1, "12:00"), f("b", 1050, 0, "13:00"), f("c", 1000, 0, "22:00")])!.id).toBe("b");
    const h = (id: string, stars: number, total: number, score: number, licenseNo = "L1") => ({ id, stars, totalSAR: total, reviewScore: score, licenseNo }) as HotelOffer;
    expect(pickHotel([h("a", 3, 900, 9), h("b", 4, 1500, 8.2), h("c", 4, 1700, 9.1), h("d", 4, 3000, 9.8)], 4)!.id).toBe("c");
    expect(pickHotel([h("a", 3, 900, 9), h("b", 4, 1500, 8.2, "")], 5)!.id).toBe("a"); // unlicensed hotels are never picked
    expect(pickHotel([h("a", 2, 500, 9)], 3)).toBeNull();
  });

  it("builds a package that meets the requirements, with notes on what changed", async () => {
    const u = user(`ex-${run}`);
    const { plan } = await planWithExtras(u, [{ adults: 2, childAges: [] }], "economy");
    const auto = await autoSelect(plan);
    expect(Object.keys(auto.flights)).toHaveLength(2);
    expect(Object.keys(auto.hotels)).toEqual(["RUH"]);
    const selection = {
      criteria: auto.criteria, flights: auto.flights, hotels: auto.hotels, activities: auto.activities,
      offers: { flights: auto.flightResults.flatMap((r) => r.offers), hotels: auto.hotelResults.flatMap((r) => r.offers), activities: auto.activityResults.flatMap((r) => r.offers) },
    };
    const check = evaluatePackage(selection);
    expect(check.ok).toBe(true);
    expect(check.totalSAR).toBeCloseTo(auto.packageTotalSAR, 2);
    const hotel = selection.offers.hotels.find((h) => h.id === auto.hotels.RUH)!;
    expect(hotel.stars === 3 || auto.notes.some((n) => n.code === "hotelTier")).toBe(true);
    if (auto.activities.length) expect(auto.notes).toContainEqual({ code: "addedActivities", count: auto.activities.length });
  });

  it("prepares the plan's tickets (child tickets for children) and tables, then books them", async () => {
    const u = user(`xt-${run}`);
    const { plan, event } = await planWithExtras(u);
    const extras = await planExtras(plan);
    expect(extras.events).toHaveLength(1);
    const ev = extras.events[0];
    expect(ev.tickets).toBe(3);
    if (event.ticketTypes?.some((t) => t.id === "child")) expect(ev.quantities?.child).toBe(1);
    expect(extras.tables).toHaveLength(1);
    expect(extras.tables[0]).toMatchObject({ restaurantId: "ruh-olaya-lebanese", party: 3, meal: "dinner", feeSAR: 0 });
    expect(Number(extras.tables[0].time.slice(0, 2))).toBeGreaterThanOrEqual(17);
    expect(extras.totalSAR).toBe(ev.totalSAR);

    const res = await bookPlanExtras(u, plan, extras, card, `bk-${run}`);
    expect(res.events[0].orderId).toBeTruthy();
    expect(res.tables[0].bookingId).toBeTruthy();
    expect((await listOrders(u.id)).map((o) => o.id)).toContain(res.events[0].orderId);
    expect((await listTableBookings(u.id)).map((b) => b.id)).toContain(res.tables[0].bookingId);
    // Same booking again: no second order (idempotent).
    const again = await bookPlanExtras(u, plan, extras, card, `bk-${run}`);
    expect(again.events[0].orderId).toBe(res.events[0].orderId);
    // A declined card doesn't stop the rest; the failure is reported.
    const u2 = user(`xt2-${run}`);
    const second = await planWithExtras(u2);
    const declined = await bookPlanExtras(u2, second.plan, await planExtras(second.plan), { ...card, number: "4000000000000002" }, `bk2-${run}`);
    expect(declined.events[0]).toMatchObject({ orderId: null });
    expect(declined.events[0].error).toMatch(/^payment_/);
  });

  it("reports tables that can't be booked yet", async () => {
    const u = user(`far-${run}`);
    const { plan } = await planWithExtras(u);
    const later = { ...plan, days: plan.days.map((d) => ({ ...d, date: addDays(d.date, 40) })) };
    const extras = await planExtras(later);
    expect(extras.issues.map((i) => i.reason)).toEqual(expect.arrayContaining(["tooFar"]));
    expect(extras.tables).toHaveLength(0);
  });
});

describe("flights, dates and holds", () => {
  it("fits the arrival and departure days to the booked flights", async () => {
    const { scheduleDay } = await import("@/lib/planner/schedule");
    const center = { lat: 24.7, lng: 46.6 };
    const dinner = { id: "d", ref: "restaurant:r", kind: "restaurant" as const, titleAr: "", titleEn: "Dinner", note: "", lat: 24.7, lng: 46.6, durationMins: 90, category: "restaurant", meal: "dinner" as const };
    const flights = { arriveAt: "2026-10-10T21:40", departAt: "2026-10-14T11:00", transfers: {} };
    const arrival = scheduleDay({ date: "2026-10-10", city: "RUH", type: "arrival", title: "", items: [dinner] }, { pace: "moderate", prayer: false, kids: false, flights }, center);
    expect(arrival.find((e) => e.item?.id === "d")!.warnings).toContain("flight");
    const visit = { ...dinner, id: "v", kind: "place" as const, meal: undefined, category: "museum", durationMins: 60, open24h: true };
    const departure = scheduleDay({ date: "2026-10-14", city: "RUH", type: "departure", title: "", items: [visit] }, { pace: "moderate", prayer: false, kids: false, flights }, center);
    expect(departure.find((e) => e.item?.id === "v")!.warnings).toContain("flight");
    const early = { arriveAt: "2026-10-10T09:00", departAt: "2026-10-14T20:00", transfers: {} };
    expect(scheduleDay({ date: "2026-10-10", city: "RUH", type: "arrival", title: "", items: [dinner] }, { pace: "moderate", prayer: false, kids: false, flights: early }, center).find((e) => e.item?.id === "d")!.warnings).not.toContain("flight");
  });

  it("leaves out tickets and tables that clash with the flights", async () => {
    const u = user(`fc-${run}`);
    const { plan } = await planWithExtras(u);
    const day = plan.days[1];
    const flights = { arriveAt: `${plan.days[0].date}T12:00`, departAt: `${plan.returnDate}T18:00`, transfers: {} };
    // Pretend the plan's second day is the departure day with an early flight.
    const shifted = { ...plan, days: plan.days.map((d) => (d.date === day.date ? { ...d, type: "departure" as const } : d)) };
    const extras = await planExtras(shifted, new Date(), { flights: { ...flights, departAt: `${day.date}T09:00` } });
    expect(extras.events).toHaveLength(0);
    expect(extras.issues.map((i) => i.reason)).toContain("flightConflict");
  });

  it("holds seats and tables for the traveller only, until the booking takes them", async () => {
    const { holdPlanExtras } = await import("@/lib/planner/execute");
    const { availability, getEvent } = await import("@/lib/events/orders");
    const u = user(`hold-${run}`);
    const other = user(`other-${run}`);
    const { plan } = await planWithExtras(u);
    const extras = await planExtras(plan, new Date(), { userId: u.id });
    const held = await holdPlanExtras(u, extras);
    expect(held.heldUntil).toBeGreaterThan(Date.now());
    const ev = held.events[0];
    const e = (await getEvent(ev.eventId, { from: ev.date, to: ev.date }))!;
    const before = (await availability(e, ev.sessionId, { except: "nobody" })).remaining;
    // Another traveller sees fewer tickets; the holder's own view is unchanged.
    const again = await planExtras(plan, new Date(), { userId: u.id });
    expect(again.events[0].quantities).toEqual(ev.quantities);
    for (const [id, n] of Object.entries(ev.quantities ?? {})) {
      const total = (await availability(e, ev.sessionId, { except: "x", now: Date.now() + 60 * 60_000 })).remaining[id];
      expect(before[id]).toBe(total - n); // the hold has expired an hour later
    }
    // The booking takes the hold over (no double count) and succeeds.
    const res = await bookPlanExtras(u, plan, held, card, "unused");
    expect(res.events[0].orderId).toBeTruthy();
    expect(res.tables[0].bookingId).toBeTruthy();
    void other;
  });

  it("asks for other dates when a date of the plan has no flights, then moves the plan", async () => {
    const { alternativeDates, ExecuteError } = await import("@/lib/planner/execute");
    const { shiftPlanDates } = await import("@/lib/planner/plans");
    const u = user(`nf-${run}`);
    const { plan } = await planWithExtras(u, [{ adults: 2, childAges: [] }]);
    process.env.SANDBOX_NO_FLIGHT_DATES = plan.request.departureDate;
    try {
      const err = await autoSelect(plan).catch((e) => e);
      expect(err).toBeInstanceOf(ExecuteError);
      expect(err.message).toBe("noFlights");
      const alts = (err.details as { alternatives: { departureDate: string }[] }).alternatives;
      expect(alts.length).toBeGreaterThan(0);
      expect(alts.every((a) => a.departureDate !== plan.request.departureDate)).toBe(true);
      expect(await alternativeDates(plan)).toEqual(alts);
      const { plan: moved, dropped } = await shiftPlanDates(u, plan.id, alts[0].departureDate, today);
      expect(moved.request.departureDate).toBe(alts[0].departureDate);
      expect(moved.days.map((d) => d.city)).toEqual(plan.days.map((d) => d.city));
      // The table is kept; the event stays only if it runs at the same time on the new day.
      const movedRefs = moved.days.flatMap((d) => d.items.map((i) => i.ref));
      expect(movedRefs.some((r) => r.startsWith("restaurant:"))).toBe(true);
      expect(dropped.length + movedRefs.filter((r) => r.startsWith("event:")).length).toBe(1);
      expect((await autoSelect(moved)).flightTimes!.arriveAt.slice(0, 10) >= alts[0].departureDate).toBe(true);
    } finally {
      delete process.env.SANDBOX_NO_FLIGHT_DATES;
    }
  });
});
