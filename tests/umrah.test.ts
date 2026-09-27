import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import type { SearchCriteria } from "@/lib/types";

vi.mock("@/lib/assistant/claude", () => ({ aiConfigured: () => false, askClaude: vi.fn(), AiUnavailableError: class extends Error {} }));

const { buildLegs, groundTransfers, validateCriteria } = await import("@/lib/itinerary");
const { generatePlan, withUmrah } = await import("@/lib/planner/generate");
const { planCriteria } = await import("@/lib/planner/handoff");
const { autoSelect } = await import("@/lib/planner/execute");
const { savePlan } = await import("@/lib/planner/plans");
const { estimateBudget } = await import("@/lib/planner/budget");
const { searchActivities, searchHotels } = await import("@/lib/agents/aggregator");
const { getUmrahSeason, pauseOverlap, setUmrahSeason } = await import("@/lib/umrah/season");
const { listUmrahTrips, umrahReminders } = await import("@/lib/umrah/trips");
const { nusukPermits } = await import("@/lib/umrah/nusuk");
const { saveBooking } = await import("@/lib/repo");
const { store } = await import("@/lib/store");
const { addDays, todayISO } = await import("@/lib/dates");
const { paxFromRooms } = await import("@/lib/occupancy");

const today = todayISO();
const rooms = [{ adults: 2, childAges: [] as number[] }];
const crit = (stays: { city: string; nights: number }[], extra: Partial<SearchCriteria> = {}): SearchCriteria => {
  const dep = addDays(today, 20);
  return { origin: "CAI", stays, departureDate: dep, returnDate: addDays(dep, stays.reduce((a, s) => a + s.nights, 0)), rooms, pax: paxFromRooms(rooms), cabin: "economy", nationality: "EG", ...extra };
};
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NUSUK_API_URL;
  delete process.env.DEMO_UMRAH;
});

describe("Makkah in a package", () => {
  it("is allowed only with the Umrah option (Muslim declaration)", () => {
    expect(validateCriteria(crit([{ city: "JED", nights: 2 }, { city: "MKX", nights: 2 }]), today)).toContain("cities");
    expect(validateCriteria(crit([{ city: "JED", nights: 2 }, { city: "MKX", nights: 2 }], { umrah: true }), today)).toEqual([]);
  });

  it("flies through Jeddah: no flight between Jeddah and Makkah, a ground transfer instead", () => {
    const a = crit([{ city: "JED", nights: 2 }, { city: "MKX", nights: 2 }, { city: "MED", nights: 2 }], { umrah: true });
    expect(buildLegs(a).map((l) => `${l.kind}:${l.from}-${l.to}`)).toEqual(["outbound:CAI-JED", "domestic:JED-MED", "return:MED-CAI"]);
    expect(groundTransfers(a).map((g) => `${g.from}-${g.to}`)).toEqual(["JED-MKX", "MKX-JED"]);
    const b = crit([{ city: "MKX", nights: 2 }, { city: "RUH", nights: 3 }], { umrah: true });
    expect(buildLegs(b).map((l) => `${l.from}-${l.to}`)).toEqual(["CAI-JED", "JED-RUH", "RUH-CAI"]);
    expect(buildLegs(b).map((l) => l.index)).toEqual([0, 1, 2]);
    expect(groundTransfers(b).map((g) => `${g.from}-${g.to}`)).toEqual(["JED-MKX", "MKX-JED"]);
    expect(groundTransfers(crit([{ city: "RUH", nights: 3 }]))).toEqual([]);
  });

  it("offers hotels near the Haram and no leisure tickets in Makkah", async () => {
    const h = await searchHotels({ city: "MKX", checkIn: addDays(today, 20), checkOut: addDays(today, 22), pax: paxFromRooms(rooms), rooms });
    expect(h.offers.length).toBeGreaterThan(0);
    expect(h.offers.every((o) => /Haram/.test(o.districtEn))).toBe(true);
    expect((await searchActivities({ city: "MKX", from: addDays(today, 20), to: addDays(today, 22), pax: paxFromRooms(rooms) })).offers).toEqual([]);
  });
});

describe("Umrah in the trip planner", () => {
  it("adds a Makkah stay after Jeddah, keeping a fixed length", () => {
    expect(withUmrah([{ city: "JED", nights: 3 }, { city: "MED", nights: 3 }], { umrah: true, nights: 6 })).toEqual([{ city: "JED", nights: 2 }, { city: "MKX", nights: 2 }, { city: "MED", nights: 2 }]);
    expect(withUmrah([{ city: "RUH", nights: 4 }], { umrah: true, nights: null })).toEqual([{ city: "MKX", nights: 2 }, { city: "RUH", nights: 4 }]);
    expect(withUmrah([{ city: "RUH", nights: 3 }], { umrah: false, nights: 3 })).toEqual([{ city: "RUH", nights: 3 }]);
  });

  it("plans an Umrah day and builds a valid package through Jeddah", async () => {
    const { plan } = await generatePlan({ origin: "CAI", nationality: "EG", departureDate: addDays(today, 20), nights: 6, cities: ["JED", "MED"], rooms, cabin: "economy", interests: ["religious", "heritage"], pace: "moderate", budgetTier: "comfort", maxBudgetSAR: null, prayer: true, accessible: false, umrah: true, notes: "" }, "ar", today);
    expect(plan.stays.map((s) => s.city)).toEqual(["JED", "MKX", "MED"]);
    expect(plan.stays.reduce((a, s) => a + s.nights, 0)).toBe(6);
    const day = plan.days.find((d) => d.umrah)!;
    expect(day).toMatchObject({ city: "MKX", title: "يوم العمرة في مكة المكرمة" });
    expect(plan.tips[0]).toContain("نسك");
    const c = planCriteria(plan);
    expect(c.umrah).toBe(true);
    expect(validateCriteria(c, today)).toEqual([]);
    const saved = await savePlan(user("umrah-planner"), plan);
    const auto = await autoSelect(saved);
    expect(auto.flightResults.map((r) => `${r.leg.from}-${r.leg.to}`)).toEqual(["CAI-JED", "JED-MED", "MED-CAI"]);
    expect(Object.keys(auto.hotels).sort()).toEqual(["JED", "MED", "MKX"]);
    // Two flights less than one per city pair: the budget counts only real domestic flights.
    const b1 = estimateBudget(plan.request, plan.stays, [], 0);
    const b2 = estimateBudget(plan.request, [{ city: "JED", nights: 2 }, { city: "RUH", nights: 2 }, { city: "MED", nights: 2 }], [], 0);
    expect(b1.flightsSAR).toBeLessThan(b2.flightsSAR);
  });
});

describe("Umrah trips, the Hajj-season pause and reminders", () => {
  it("keeps the pause dates set by the back office", async () => {
    await expect(setUmrahSeason({ pauseFrom: "2027-05-20", pauseTo: "2027-05-01" }, "a@x")).rejects.toThrow();
    const s = await setUmrahSeason({ pauseFrom: "2027-05-01", pauseTo: "2027-06-20" }, "a@x");
    expect(s).toMatchObject({ pauseFrom: "2027-05-01", pauseTo: "2027-06-20", updatedBy: "a@x" });
    expect(pauseOverlap(s, "2027-04-28", "2027-05-03")).toEqual({ from: "2027-05-01", to: "2027-05-03" });
    expect(pauseOverlap(s, "2027-07-01", "2027-07-03")).toBeNull();
    expect(await setUmrahSeason({ pauseFrom: "", pauseTo: "" }, "a@x")).toMatchObject({ pauseFrom: null, pauseTo: null });
    expect((await getUmrahSeason()).pauseFrom).toBeNull();
  });

  it("finds the Umrah day of a booking, warns in the pause, and reminds the traveller", async () => {
    const u = user("umrah-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    const c = crit([{ city: "JED", nights: 2 }, { city: "MKX", nights: 2 }, { city: "MED", nights: 2 }], { umrah: true });
    const b = {
      id: "umrah-b1", reference: "TA-UMRAH1", userId: u.id, accountType: "individual", clientReference: null, createdAt: new Date().toISOString(),
      criteria: c, flights: [], hotels: [], activities: [], price: { totalSAR: 1 }, displayCurrency: "SAR", payment: null, status: "COMPLETED",
      mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null },
      applicants: [{ applicationNo: "1", paxType: "adult", nameEn: "SARA ALI", nationality: "EG", passportNo: "A12345678", email: "s@example.com", visaNumber: "601", visaExpiryDate: "2027-12-01", visaStatus: "ISSUED" }],
      ticketNos: [], modifications: [],
    } as unknown as StoredBooking;
    await saveBooking(b);
    const makkah = addDays(c.departureDate, 2);
    await setUmrahSeason({ pauseFrom: makkah, pauseTo: addDays(makkah, 40) }, "a@x");
    const [t] = await listUmrahTrips(u.id);
    expect(t).toMatchObject({ bookingId: "umrah-b1", makkahFrom: makkah, makkahTo: addDays(makkah, 2), umrahDate: addDays(makkah, 1), route: "jeddah", fromCity: "JED", pause: { from: makkah, to: addDays(makkah, 2) } });
    // Not yet: 20 days before the trip.
    expect(await umrahReminders(u.id)).toBe(0);
    // Five days before: book in Nusuk (with the pause warning), once.
    const before = new Date(`${addDays(c.departureDate, -5)}T06:00:00Z`);
    expect(await umrahReminders(u.id, before)).toBe(1);
    await umrahReminders(u.id, before);
    const book = await store().get<{ kind: string; severity?: string; linesAr: string[] }>("notifications", "umrah:book:umrah-b1");
    expect(book).toMatchObject({ kind: "umrah", severity: "warning" });
    expect(book!.linesAr.join(" ")).toContain("إيقاف");
    // The Umrah day itself.
    await umrahReminders(u.id, new Date(`${t.umrahDate}T04:00:00Z`));
    expect(await store().get("notifications", "umrah:day:umrah-b1")).toMatchObject({ titleEn: "Today is your Umrah day" });
    await setUmrahSeason({}, "a@x");
  });

  it("shows a sample trip only when there is none (sandbox)", async () => {
    expect((await listUmrahTrips("umrah-nobody"))[0]).toMatchObject({ demo: true, route: "jeddah" });
    process.env.DEMO_UMRAH = "off";
    expect(await listUmrahTrips("umrah-nobody")).toEqual([]);
  });

  it("reads the traveller's permits from Nusuk when linked", async () => {
    expect(await nusukPermits("A1", "EG")).toBeNull();
    process.env.NUSUK_API_URL = "https://nusuk.example/api/";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ type: "umrah", date: "2026-10-20T00:00:00", time: "05:30:00", status: "confirmed" }, { type: "rawdah", date: "bad" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await nusukPermits("A1", "EG")).toEqual([{ type: "umrah", date: "2026-10-20", time: "05:30", status: "confirmed" }]);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://nusuk.example/api/permits?passportNo=A1&nationality=EG");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    expect(await nusukPermits("A1", "EG")).toBeNull();
  });
});
