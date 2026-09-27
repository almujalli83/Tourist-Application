import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { randomUUID } from "node:crypto";
import type { StoredBooking } from "@/lib/bookings/types";
import { GET } from "@/app/api/indicators/route";
import { clearIndicatorsCache, computeIndicators, toCsv } from "@/lib/indicators/indicators";
import { store } from "@/lib/store";

function booking(o: { dep: string; nat: string; n: number; cities: [string, number][]; total: number; stars?: number; created?: string; company?: boolean }): StoredBooking {
  const id = randomUUID();
  return {
    id, reference: `TA-${id.slice(0, 6)}`, userId: "u", accountType: o.company ? "company" : "individual", clientReference: null, createdAt: o.created ?? "2026-01-01T00:00:00Z",
    criteria: { origin: "CAI", stays: o.cities.map(([city, nights]) => ({ city, nights })), departureDate: o.dep, returnDate: o.dep, rooms: [], pax: { adults: o.n, children: 0, infants: 0 }, cabin: "economy", nationality: o.nat },
    flights: [], hotels: [{ stars: o.stars ?? 4 }], activities: [], price: { totalSAR: o.total }, status: "COMPLETED",
    mt: { packageStatus: "COMPLETED" },
    applicants: Array.from({ length: o.n }, (_, i) => ({ applicationNo: String(i), nameEn: "PERSON NAME", passportNo: `P${i}`, nationality: o.nat, visaNumber: i === 0 ? "V1" : null })),
  } as unknown as StoredBooking;
}

describe("tourism indicators", () => {
  it("aggregates visitors, destinations and spending, hiding small counts", async () => {
    // 6 Egyptian travellers and 2 Indonesian ones in March; 3 French in April (outside the period); one cancelled.
    await store().put("bookings", "i1", booking({ dep: "2031-03-05", nat: "EG", n: 4, cities: [["RUH", 2], ["ULH", 3]], total: 20000, created: "2031-02-03T00:00:00Z" }));
    await store().put("bookings", "i2", booking({ dep: "2031-03-20", nat: "EG", n: 2, cities: [["JED", 4]], total: 8000, stars: 5, created: "2031-03-10T00:00:00Z" }));
    await store().put("bookings", "i3", booking({ dep: "2031-03-25", nat: "ID", n: 2, cities: [["JED", 2]], total: 6000, company: true }));
    await store().put("bookings", "i4", booking({ dep: "2031-04-02", nat: "FR", n: 3, cities: [["RUH", 5]], total: 9000 }));
    await store().put("bookings", "i5", { ...booking({ dep: "2031-03-10", nat: "EG", n: 9, cities: [["RUH", 1]], total: 1 }), status: "CANCELLED" });
    for (let i = 0; i < 6; i++) await store().put("reviews", `r${i}`, { id: `r${i}`, targetType: "hotel", rating: i < 3 ? 5 : 4, createdAt: "2031-03-15T00:00:00Z", status: "published" });
    await store().put("trainOrders", "t1", { id: "t1", createdAt: "2031-03-12T00:00:00Z", status: "CONFIRMED", totalSAR: 300 });
    await store().put("trainOrders", "t2", { id: "t2", createdAt: "2031-03-12T00:00:00Z", status: "CANCELLED", totalSAR: 999 });

    const d = await computeIndicators({ from: "2031-03", to: "2031-03" }, new Date("2031-03-01T00:00:00Z"));
    expect(d.visitors).toMatchObject({ bookings: 3, travellers: 8, visasIssued: 3, avgGroupSize: 2.7, companyShare: 33.3 });
    expect(d.visitors.avgLeadDays).toBeGreaterThan(0);
    expect(d.byNationality).toEqual([{ code: "EG", travellers: 6 }, { code: "ID", travellers: null }]);
    expect(d.byCity.find((c) => c.city === "JED")).toEqual({ city: "JED", visitors: null, nights: 12 }); // 2×4 + 2×2
    expect(d.byCity.find((c) => c.city === "ULH")).toEqual({ city: "ULH", visitors: null, nights: 12 });
    expect(d.byMonth).toEqual([{ month: "2031-03", bookings: 3, travellers: 8 }]);
    expect(d.hotelStars).toEqual([{ stars: 3, stays: 0 }, { stars: 4, stays: null }, { stars: 5, stays: null }]);
    expect(d.spending.packagesSAR).toBe(34000);
    expect(d.spending.perTravellerSAR).toBe(4250);
    expect(d.spending.services.find((s) => s.service === "trains")).toEqual({ service: "trains", orders: 1, amountSAR: 300 });
    expect(d.satisfaction).toMatchObject({ reviews: 6, avg: 4.5 });
    expect(d.satisfaction.byTarget[0]).toEqual({ target: "hotel", reviews: 6, avg: 4.5 });
    expect(d.upcoming.next30).toBe(8);
    // No personal data anywhere.
    expect(JSON.stringify(d)).not.toMatch(/PERSON NAME|P0|TA-/);

    const ruh = await computeIndicators({ from: "2031-03", to: "2031-04", city: "RUH" }, new Date("2031-03-01T00:00:00Z"));
    expect(ruh.visitors.bookings).toBe(2);
    expect(ruh.byMonth.map((m) => m.travellers)).toEqual([4, 3]);

    const csv = toCsv(d);
    expect(csv.split("\n")[0]).toBe("section,key,metric,value");
    expect(csv).toContain("nationality,ID,travellers,<5");
    expect(csv).toContain("services,trains,SAR,300");
  });

  it("is open to the Ministry's platform with its token only", async () => {
    clearIndicatorsCache();
    process.env.INDICATORS_TOKEN = "t".repeat(32);
    const call = (auth?: string, qs = "from=2031-03&to=2031-03") => GET(new Request(`http://localhost/api/indicators?${qs}`, { headers: auth ? { authorization: auth } : {} }));
    expect((await call("Bearer wrong-token-wrong-token-wrong")).status).toBe(401);
    expect((await call()).status).toBe(401);
    const ok = await call(`Bearer ${"t".repeat(32)}`);
    expect(ok.status).toBe(200);
    expect((await ok.json()).period.from).toBe("2031-03");
    expect((await call(`Bearer ${"t".repeat(32)}`, "from=2031-05&to=2031-03")).status).toBe(400);
    const csv = await call(`Bearer ${"t".repeat(32)}`, "from=2031-03&to=2031-03&format=csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    delete process.env.INDICATORS_TOKEN;
  });
});
