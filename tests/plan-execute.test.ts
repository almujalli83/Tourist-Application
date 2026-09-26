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
    const declined = await bookPlanExtras(u, plan, extras, { ...card, number: "4000000000000002" }, `bk2-${run}`);
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
