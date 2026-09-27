import { describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import type { StoredBooking } from "@/lib/bookings/types";
import { saveBooking } from "@/lib/repo";
import { store } from "@/lib/store";
import { STATIONS } from "@/lib/trains/network";
import { AIRPORTS, transportReminders } from "@/lib/transport/reminders";
import { estimateFromKm, estimateRide, legBetween, TARIFF } from "@/lib/transport/rides";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });

describe("ride estimates", () => {
  it("estimates a fare range and time, never below the minimum fare", () => {
    const short = estimateFromKm(0.5);
    expect(short.minSAR).toBeGreaterThanOrEqual(Math.round(TARIFF.minimum * 0.85 / 5) * 5);
    expect(short.maxSAR).toBeGreaterThan(short.minSAR);
    const airport = estimateRide(AIRPORTS.RUH, { lat: 24.7136, lng: 46.6753 });
    expect(airport.km).toBeGreaterThan(30);
    expect(airport.minSAR).toBeGreaterThan(40);
    expect(airport.maxSAR % 5).toBe(0);
    expect(airport.mins).toBeGreaterThan(40);
  });

  it("suggests walking between close places and a car otherwise", () => {
    expect(legBetween({ lat: 24.7336, lng: 46.5753 }, { lat: 24.7366, lng: 46.5753 })).toMatchObject({ mode: "walk" });
    expect(legBetween({ lat: 24.7336, lng: 46.5753 }, { lat: 24.7136, lng: 46.6753 })).toMatchObject({ mode: "car" });
  });

  it("links Jeddah and Makkah on the Haramain line (Makkah city code)", () => {
    expect(STATIONS.find((s) => s.code === "MKK")?.city).toBe("MKX");
  });
});

describe("transport reminders", () => {
  function booking(id: string, userId: string, stays: { city: string; nights: number }[], out: { to: string; arriveAt: string }, ret: { from: string; departAt: string }): StoredBooking {
    return {
      id, reference: `TA-${id}`, userId, accountType: "individual", clientReference: null, createdAt: "2026-09-01T00:00:00Z",
      criteria: { origin: "CAI", stays, departureDate: out.arriveAt.slice(0, 10), returnDate: ret.departAt.slice(0, 10), rooms: [{ adults: 1, childAges: [] }], pax: { adults: 1, children: 0, infants: 0 }, cabin: "economy", nationality: "EG" },
      flights: [
        { kind: "outbound", from: "CAI", to: out.to, departAt: `${out.arriveAt.slice(0, 10)}T08:00`, arriveAt: out.arriveAt, flightNo: "SV300", carrierNameEn: "Saudia", carrierNameAr: "السعودية" },
        { kind: "return", from: ret.from, to: "CAI", departAt: ret.departAt, arriveAt: `${ret.departAt.slice(0, 10)}T23:00`, flightNo: "SV301", carrierNameEn: "Saudia", carrierNameAr: "السعودية" },
      ],
      hotels: [], activities: [], price: { totalSAR: 1 }, displayCurrency: "SAR", payment: null, status: "COMPLETED",
      mt: { mode: "sandbox", messageId: "m", packageId: "p", packageStatus: "COMPLETED", lastCheckedAt: null }, applicants: [], ticketNos: [], modifications: [],
    } as unknown as StoredBooking;
  }

  it("on the arrival day: how to get from the airport (estimate, Haramain train from Jeddah to Makkah)", async () => {
    const u = user("tr-u1");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await saveBooking(booking("tr-b1", u.id, [{ city: "MKX", nights: 2 }, { city: "MED", nights: 2 }], { to: "JED", arriveAt: "2026-11-02T13:30" }, { from: "MED", departAt: "2026-11-06T18:00" }));
    // The day before: nothing.
    expect(await transportReminders(u.id, new Date("2026-11-01T09:00:00Z"))).toBe(0);
    const at = new Date("2026-11-02T06:00:00Z"); // 09:00 in Saudi Arabia
    expect(await transportReminders(u.id, at)).toBe(1);
    expect(await transportReminders(u.id, at)).toBe(0);
    const n = await store().get<{ kind: string; linesAr: string[]; linesEn: string[]; href: string }>("notifications", "transport:arrival:tr-b1");
    expect(n).toMatchObject({ kind: "transport", href: "/transport" });
    expect(n!.linesAr.join(" ")).toContain("قطار الحرمين");
    expect(n!.linesEn.join(" ")).toMatch(/SAR \d+–\d+/);
  });

  it("on the departure day: when to set off for the airport", async () => {
    const u = user("tr-u2");
    await store().put("users", u.id, { ...u, passwordHash: "x" });
    await saveBooking(booking("tr-b2", u.id, [{ city: "RUH", nights: 3 }], { to: "RUH", arriveAt: "2026-11-10T10:00" }, { from: "RUH", departAt: "2026-11-13T18:00" }));
    // After take-off: too late.
    expect(await transportReminders(u.id, new Date("2026-11-13T16:00:00Z"))).toBe(0);
    expect(await transportReminders(u.id, new Date("2026-11-13T05:00:00Z"))).toBe(1);
    const n = await store().get<{ linesEn: string[] }>("notifications", "transport:departure:tr-b2");
    const line = n!.linesEn[0];
    expect(line).toContain("be at the airport by 15:00");
    const leave = line.match(/set off by about (\d\d):(\d\d)/)!;
    expect(Number(leave[1]) * 60 + Number(leave[2])).toBeLessThan(15 * 60 - 40);
    expect(Number(leave[2]) % 15).toBe(0);
  });
});
