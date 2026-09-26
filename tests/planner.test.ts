import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";

const ask = vi.fn();
let live = false;
vi.mock("@/lib/assistant/claude", () => ({
  aiConfigured: () => live,
  askClaude: (...args: unknown[]) => ask(...args),
  AiUnavailableError: class extends Error {},
}));

const { prayerTimes, isRamadan } = await import("@/lib/prayer/times");
const { buildSkeleton, generatePlan, normalizeStays, PlanError, regenerateDay, sanitizeRequest } = await import("@/lib/planner/generate");
const { scheduleDay, nextOpen, fmtMin } = await import("@/lib/planner/schedule");
const { bookingMatchesPlan, getPlan, importPlan, linkPlanToBooking, savePlan, updatePlanDays } = await import("@/lib/planner/plans");
const { withActivities } = await import("@/lib/planner/budget");
const { addDays, todayISO } = await import("@/lib/dates");

const run = Math.random().toString(36).slice(2, 8);
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const today = todayISO();
const dep = addDays(today, 10);
const baseReq = {
  origin: "CAI", nationality: "EG", departureDate: dep, nights: null, cities: [], rooms: [{ adults: 2, childAges: [] }], cabin: "economy",
  interests: ["heritage", "food"], pace: "moderate", budgetTier: "comfort", maxBudgetSAR: null, prayer: true, accessible: false, notes: "",
};
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

beforeEach(() => {
  live = false;
  ask.mockReset();
});

describe("prayer times (Umm al-Qura)", () => {
  it("matches published times within a few minutes", () => {
    const riyadh = prayerTimes("2026-10-10", 24.7136, 46.6753);
    const expected = { fajr: "04:31", dhuhr: "11:39", asr: "15:03", maghrib: "17:29", isha: "18:59" };
    for (const [k, v] of Object.entries(expected)) expect(Math.abs(toMin(riyadh[k as keyof typeof riyadh]) - toMin(v))).toBeLessThanOrEqual(3);
    // Isha is 120 minutes after Maghrib in Ramadan.
    expect(isRamadan("2027-02-15")).toBe(true);
    const r = prayerTimes("2027-02-15", 24.7136, 46.6753);
    expect(toMin(r.isha) - toMin(r.maghrib)).toBe(120);
  });
});

describe("planner request", () => {
  it("rejects invalid input with the fields to fix", () => {
    try {
      sanitizeRequest({ ...baseReq, origin: "RUH", departureDate: today, nights: 40, interests: [], pace: "x" }, today);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      expect((e as InstanceType<typeof PlanError>).fields).toEqual(expect.arrayContaining(["origin", "departureDate", "nights", "interests", "pace"]));
    }
    const ok = sanitizeRequest({ ...baseReq, notes: "  quiet   places\nplease " }, today);
    expect(ok.notes).toBe("quiet places please");
    expect(ok.prayer).toBe(true);
  });

  it("lays out arrival, transfer and departure days and fixes the nights", () => {
    const days = buildSkeleton("2026-10-10", [{ city: "RUH", nights: 2 }, { city: "JED", nights: 2 }]);
    expect(days.map((d) => `${d.date.slice(8)}:${d.city}:${d.type}`)).toEqual(["10:RUH:arrival", "11:RUH:full", "12:JED:transfer", "13:JED:full", "14:JED:departure"]);
    const req = sanitizeRequest({ ...baseReq, nights: 5 }, today);
    const stays = normalizeStays([{ city: "RUH", nights: 4 }, { city: "XXX", nights: 2 }, { city: "JED", nights: 4 }], req, ["RUH", "JED"]);
    expect(stays.map((s) => s.city)).toEqual(["RUH", "JED"]);
    expect(stays.reduce((a, s) => a + s.nights, 0)).toBe(5);
    const fixed = sanitizeRequest({ ...baseReq, nights: 4, cities: ["ULH", "RUH"] }, today);
    expect(normalizeStays([{ city: "JED", nights: 4 }], fixed, ["ULH", "RUH"])).toEqual([{ city: "ULH", nights: 2 }, { city: "RUH", nights: 2 }]);
  });
});

describe("plan generation", () => {
  it("builds a plan from the app's data with rules when Claude is not configured", async () => {
    const { plan } = await generatePlan({ ...baseReq, nights: 5 }, "ar", today);
    expect(plan.source).toBe("rules");
    expect(plan.stays.reduce((a, s) => a + s.nights, 0)).toBe(5);
    expect(plan.days).toHaveLength(6);
    expect(plan.returnDate).toBe(addDays(dep, 5));
    const refs = plan.days.flatMap((d) => d.items.map((i) => i.ref)).filter((r) => r.startsWith("place:"));
    expect(new Set(refs).size).toBe(refs.length);
    expect(plan.days.some((d) => d.items.length > 0)).toBe(true);
    for (const d of plan.days) for (const i of d.items) if (i.kind === "event") expect(i.ref).toContain(`@${d.date}`);
    expect(plan.budget.totalSAR).toBeGreaterThan(plan.budget.flightsSAR);
    expect(plan.budget.packageMinSAR).toBe(4000);
    expect(plan.summary).toContain("5");
  });

  it("uses Claude's picks but drops anything not in the app or on the wrong day", async () => {
    live = true;
    const d1 = dep;
    const d2 = addDays(dep, 1);
    ask.mockResolvedValue(JSON.stringify({
      stays: [{ city: "RUH", nights: 3 }, { city: "MARS", nights: 2 }],
      summary: "رحلة تراثية إلى الرياض.",
      tips: ["اشرب الماء"],
      days: [
        { date: d1, title: "الوصول", items: [{ ref: "place:nope", note: "x", meal: "none" }] },
        { date: d2, title: "الدرعية", items: [
          { ref: "restaurant:ruh-najd-heritage", note: "عشاء نجدي", meal: "dinner" },
          { ref: "restaurant:jed-bosphorus", note: "wrong city", meal: "lunch" },
          { ref: "event:ruh-turaif-night-tour@1999-01-01T19:00", note: "wrong date", meal: "none" },
        ] },
      ],
    }));
    const { plan } = await generatePlan({ ...baseReq, nights: 3 }, "ar", today);
    expect(plan.source).toBe("claude");
    expect(plan.stays).toEqual([{ city: "RUH", nights: 3 }]);
    expect(plan.days[0].items).toEqual([]);
    expect(plan.days[1].title).toBe("الدرعية");
    expect(plan.days[1].items.map((i) => i.ref)).toEqual(["restaurant:ruh-najd-heritage"]);
    expect(plan.days[1].items[0].bookHref).toContain(`date=${d2}`);
    const call = ask.mock.calls[0][0];
    expect(call.schema.required).toContain("days");
    expect(call.messages[0].content).toContain("restaurant:ruh-najd-heritage");
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("falls back to rules when Claude declines", async () => {
    live = true;
    ask.mockResolvedValue(null);
    const { plan } = await generatePlan({ ...baseReq, nights: 3, cities: ["ULH"] }, "en", today);
    expect(plan.source).toBe("rules");
    expect(plan.stays).toEqual([{ city: "ULH", nights: 3 }]);
  });

  it("regenerates one day differently and keeps the others", async () => {
    const { plan } = await generatePlan({ ...baseReq, nights: 4, cities: ["RUH"], pace: "intense", interests: ["heritage", "culture", "entertainment", "shopping", "nature"] }, "en", today);
    const full = plan.days.find((d) => d.type === "full" && d.items.some((i) => i.kind === "place"))!;
    const others = new Set(plan.days.filter((d) => d !== full).flatMap((d) => d.items.map((i) => i.ref.split("@")[0])));
    const { day } = await regenerateDay(plan, full.date, today);
    expect(day.date).toBe(full.date);
    for (const i of day.items) if (i.kind !== "restaurant") expect(others.has(i.ref.split("@")[0])).toBe(false);
  });
});

describe("day schedule", () => {
  it("keeps event times, reserves prayers, and waits for places to open", async () => {
    const date = "2026-10-11";
    const day = {
      date, city: "RUH", type: "full" as const, title: "",
      items: [
        { id: "a", ref: "place:x", kind: "place" as const, titleAr: "", titleEn: "Turaif", note: "", lat: 24.7336, lng: 46.5753, durationMins: 120, category: "heritage", hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "16:00", close: "00:00" }] },
        { id: "b", ref: "event:e@x", kind: "event" as const, titleAr: "", titleEn: "Show", note: "", lat: 24.7336, lng: 46.5753, durationMins: 90, category: "culture", fixedStart: "19:00" },
        { id: "c", ref: "restaurant:r", kind: "restaurant" as const, titleAr: "", titleEn: "Dinner", note: "", lat: 24.7353, lng: 46.577, durationMins: 90, category: "restaurant", meal: "dinner" as const },
      ],
    };
    const entries = scheduleDay(day, { pace: "moderate", prayer: true, kids: false }, { lat: 24.7136, lng: 46.6753 });
    const at = (id: string) => entries.find((e) => e.item?.id === id)!;
    expect(fmtMin(at("a").start)).toBe("16:00");
    expect(fmtMin(at("b").start)).toBe("19:00");
    expect(at("c").start).toBeGreaterThanOrEqual(20 * 60 + 30);
    // The visit ran into the event: it is flagged.
    expect(entries.filter((e) => e.kind === "prayer").map((e) => e.prayer)).toEqual(["dhuhr", "asr", "maghrib", "isha"]);
    expect(nextOpen({ hours: [{ days: [1], open: "09:00", close: "12:00" }] }, "2026-10-11", 600)).toBeNull(); // a Sunday
    expect(nextOpen({ hours: [{ days: [6], open: "16:00", close: "01:00" }] }, "2026-10-11", 30)).toBe(30); // Saturday night slot
  });
});

describe("saved plans", () => {
  it("saves, edits, and attaches a plan to the booking made from it", async () => {
    const u = user(`pl-${run}`);
    const { plan } = await generatePlan({ ...baseReq, nights: 3, cities: ["RUH"] }, "ar", today);
    const saved = await savePlan(u, plan);
    const day = saved.days.find((d) => d.items.length >= 1)!;
    // Remove the first item and add a restaurant lunch.
    const edited = saved.days.map((d) => d.date === day.date
      ? { ...d, items: [...d.items.slice(1).map((i) => ({ id: i.id, ref: i.ref, note: i.note, meal: i.meal })), { ref: "restaurant:ruh-olaya-lebanese", meal: "lunch", note: "" }] }
      : d);
    const updated = await updatePlanDays(u, saved.id, edited);
    const d2 = updated.days.find((d) => d.date === day.date)!;
    expect(d2.items.map((i) => i.ref)).not.toContain(day.items[0].ref);
    expect(d2.items.some((i) => i.ref === "restaurant:ruh-olaya-lebanese" && i.meal === "lunch")).toBe(true);
    expect(withActivities(updated.budget, updated.days, null).totalSAR).toBe(updated.budget.totalSAR);

    const criteria = { origin: "CAI", stays: saved.stays, departureDate: saved.request.departureDate, returnDate: saved.returnDate, rooms: saved.request.rooms, pax: { adults: 2, children: 0, infants: 0 }, cabin: "economy" as const, nationality: "EG" };
    expect(bookingMatchesPlan(saved, { ...criteria, departureDate: addDays(dep, 1) })).toBe(false);
    expect(await linkPlanToBooking("someone-else", saved.id, { id: "b1", reference: "R1", criteria })).toBe(false);
    expect(await linkPlanToBooking(u.id, saved.id, { id: "b1", reference: "R1", criteria })).toBe(true);
    const booked = await getPlan(u.id, saved.id);
    expect(booked?.status).toBe("booked");
    expect(booked?.bookingReference).toBe("R1");
    await expect(updatePlanDays(u, saved.id, edited)).rejects.toThrow("locked");
    expect(await linkPlanToBooking(u.id, saved.id, { id: "b2", reference: "R2", criteria })).toBe(false);
  });

  it("imports a visitor's plan, re-checking every activity", async () => {
    const u = user(`imp-${run}`);
    const { plan } = await generatePlan({ ...baseReq, nights: 2, cities: ["JED"] }, "en", today);
    const tampered = { ...plan, days: plan.days.map((d, i) => (i === 1 ? { ...d, items: [{ ref: "place:fake", note: "<script>", titleEn: "Fake" }] } : d)) };
    const saved = await importPlan(u, tampered, today);
    expect(saved.userId).toBe(u.id);
    expect(saved.days[1].items).toEqual([]);
    expect(saved.stays).toEqual([{ city: "JED", nights: 2 }]);
  });
});
