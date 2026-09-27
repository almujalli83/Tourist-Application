import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { busSeatMap, cancelBusOrder, createBusOrder, listBusOrders, searchBuses } from "@/lib/buses/orders";
import { busProviders, sandboxRefund } from "@/lib/buses/provider";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const card = { holder: "SARA ALI", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const now = new Date("2026-10-01T09:00:00Z");
const day = "2026-10-05";
const adult = { type: "adult" as const, nameEn: "SARA ALI", nationality: "EG", passportNo: "A1234567" };
const child = { type: "child" as const, nameEn: "OMAR ALI", nationality: "EG", passportNo: "A7654321" };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BUS_PROVIDERS;
});

describe("intercity buses (SAPTCO sandbox)", () => {
  it("searches trips between cities with fares by distance and classes", async () => {
    const trips = await searchBuses("RUH", "DMM", day, now);
    expect(trips.length).toBeGreaterThan(4);
    expect(trips.every((t, i) => i === 0 || t.depart >= trips[i - 1].depart)).toBe(true);
    const std = trips.find((t) => t.cls === "standard")!;
    const vip = trips.find((t) => t.cls === "vip")!;
    expect(vip.fare.adult).toBeGreaterThan(std.fare.adult);
    expect(std.fare.child).toBeLessThan(std.fare.adult);
    expect(std.durationMins).toBeGreaterThan(200);
    const jed = await searchBuses("RUH", "JED", day, now);
    expect(jed[0].fare.adult).toBeGreaterThan(std.fare.adult);
    expect(await searchBuses("RUH", "MKX", day, now)).toEqual([]);
    await expect(searchBuses("RUH", "DMM", "tomorrow", now)).rejects.toMatchObject({ code: "invalidSearch" });
  });

  it("books seats (held, paid, issued), protects taken seats, cancels with the refund policy", async () => {
    const u = user("bs-1");
    const trip = (await searchBuses("RUH", "DMM", day, now)).find((t) => t.cls === "standard")!;
    const map = await busSeatMap(trip.providerId, trip.id);
    const free = Array.from({ length: map.rows }, (_, r) => map.letters.map((l) => `${r + 1}${l}`)).flat().filter((s) => !map.taken.includes(s));
    const base = { providerId: trip.providerId, tripId: trip.id, from: "RUH", to: "DMM", date: day, card };
    const total = trip.fare.adult + trip.fare.child;
    await expect(createBusOrder(u, { ...base, seats: [free[0]], passengers: [child], expectedTotalSAR: trip.fare.child }, now)).rejects.toMatchObject({ code: "adultRequired" });
    await expect(createBusOrder(u, { ...base, seats: [free[0], free[1]], passengers: [adult, child], expectedTotalSAR: 1 }, now)).rejects.toMatchObject({ code: "priceChanged" });
    if (map.taken.length) await expect(createBusOrder(u, { ...base, seats: [map.taken[0], free[1]], passengers: [adult, child], expectedTotalSAR: total }, now)).rejects.toMatchObject({ code: "seatTaken" });
    await expect(createBusOrder(u, { ...base, tripId: "forged", seats: [free[0], free[1]], passengers: [adult, child], expectedTotalSAR: total }, now)).rejects.toMatchObject({ code: "tripNotFound" });
    const o = await createBusOrder(u, { ...base, seats: [free[0], free[1]], passengers: [adult, child], expectedTotalSAR: total }, now);
    expect(o).toMatchObject({ status: "CONFIRMED", totalSAR: total, sandbox: true });
    expect(o.tickets.map((t) => t.seat)).toEqual([free[0], free[1]]);
    expect(o.passengers[0].passportMasked).toBe("••••4567");
    expect(JSON.stringify(o)).not.toContain("A1234567");
    // The seats are now taken for others.
    expect((await busSeatMap(trip.providerId, trip.id)).taken).toEqual(expect.arrayContaining([free[0], free[1]]));
    await expect(createBusOrder(user("bs-2"), { ...base, seats: [free[0]], passengers: [adult], expectedTotalSAR: trip.fare.adult }, now)).rejects.toMatchObject({ code: "seatTaken" });
    const c = await cancelBusOrder(u.id, o.id, now);
    expect(c.status).toBe("CANCELLED");
    expect(c.cancellation!.refundSAR).toBe(total);
    expect((await busSeatMap(trip.providerId, trip.id)).taken).not.toContain(free[0]);
    expect((await listBusOrders(u.id))[0].id).toBe(o.id);
  });

  it("refund policy and declined cards release the seats", async () => {
    const dep = "2026-10-05T10:00:00.000Z";
    expect(sandboxRefund(dep, 100, new Date("2026-10-04T09:00:00Z"))).toBe(100);
    expect(sandboxRefund(dep, 100, new Date("2026-10-05T05:00:00Z"))).toBe(50);
    expect(sandboxRefund(dep, 100, new Date("2026-10-05T09:00:00Z"))).toBe(0);
    const trip = (await searchBuses("JED", "MED", day, now))[0];
    const map = await busSeatMap(trip.providerId, trip.id);
    const seat = Array.from({ length: map.rows }, (_, r) => map.letters.map((l) => `${r + 1}${l}`)).flat().find((s) => !map.taken.includes(s))!;
    await expect(createBusOrder(user("bs-3"), { providerId: trip.providerId, tripId: trip.id, from: "JED", to: "MED", date: day, seats: [seat], passengers: [adult], expectedTotalSAR: trip.fare.adult, card: { ...card, number: "4000000000000002" } }, now)).rejects.toMatchObject({ code: "declined" });
    expect((await busSeatMap(trip.providerId, trip.id)).taken).not.toContain(seat);
  });

  it("links operators by API", async () => {
    process.env.BUS_PROVIDERS = JSON.stringify([{ id: "saptco", nameAr: "سابتكو", nameEn: "SAPTCO", url: "https://api.saptco.test/v1", token: "t" }]);
    const f = vi.fn(async () => new Response(JSON.stringify([{ id: "T1", tripNo: "101", from: "RUH", to: "DMM", depart: "2026-10-05T06:00:00Z", arrive: "2026-10-05T11:00:00Z", durationMins: 300, cls: "vip", fare: { adult: 120, child: 60 }, seatsLeft: 20 }, { id: "bad" }]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(busProviders().map((p) => p.sandbox)).toEqual([false]);
    const trips = await searchBuses("RUH", "DMM", day, now);
    expect(trips).toEqual([expect.objectContaining({ id: "T1", providerId: "saptco", cls: "vip" })]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.saptco.test/v1/trips?from=RUH&to=DMM&date=2026-10-05");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });
});
