import { describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { destinationsFrom, LINES, STATIONS } from "@/lib/trains/network";
import {
  cancelTrainOrder, canCancelTrain, getTrainOrder, listTrainOrders, placeTrainOrder, priceOrder, refundQuote, unavailableSeats,
} from "@/lib/trains/orders";
import { allSeats, refundShare, searchTrips, seatInfo, tripById } from "@/lib/trains/sar";

const run = Math.random().toString(36).slice(2, 8);
const card = { holder: "Test User", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10);
const today = addDays(0);
const manual = (name: string, passport: string, type: "adult" | "child" = "adult") => ({ type, nameEn: name, nationality: "EG", passportNo: passport });

async function freeSeats(runId: string, cls: "economy" | "business", n: number) {
  const taken = new Set(await unavailableSeats(runId, cls));
  return allSeats(cls).filter((s) => !taken.has(s)).slice(0, n);
}

describe("SAR timetable", () => {
  it("has consistent lines and stations", () => {
    for (const l of LINES) for (const s of l.stops) expect(STATIONS.find((x) => x.code === s.code)?.line).toBe(l.id);
    expect(destinationsFrom("JSL").map((s) => s.code).sort()).toEqual(["JAP", "KEC", "MDN", "MKK"]);
    expect(STATIONS.find((s) => s.code === "MKK")?.muslimsOnly).toBe(true);
  });

  it("finds trips both ways, in Saudi time, and rebuilds them from their id", () => {
    const day = addDays(5);
    const out = searchTrips("JSL", "MDN", day, today);
    const back = searchTrips("MDN", "JSL", day, today);
    expect(out.length).toBeGreaterThan(3);
    expect(back.length).toBeGreaterThan(3);
    const first = out[0];
    expect(first.durationMins).toBe(105);
    // 06:00 from Makkah + 35 min → 06:35 in Jeddah = 03:35 UTC.
    expect(first.depart.slice(11, 16)).toBe("03:35");
    expect(tripById(first.id)).toEqual(first);
    expect(tripById(first.id.replace("JSL-MDN", "MDN-JSL"))).toBeNull();
    expect(searchTrips("JSL", "DMS", day, today)).toEqual([]); // different lines
    expect(searchTrips("JSL", "MDN", addDays(-1), today)).toEqual([]);
    expect(first.fares.business.adult).toBeGreaterThan(first.fares.economy.adult);
    expect(first.fares.economy.child).toBe(Math.round(first.fares.economy.adult / 2));
  });

  it("knows seats and the refund policy", () => {
    expect(seatInfo("C1-3B")?.coach.cls).toBe("business");
    expect(seatInfo("C1-3D")).toBeNull();
    expect(seatInfo("C2-16A")).toBeNull();
    const now = new Date("2026-10-01T00:00:00Z");
    expect(refundShare("2026-10-03T00:00:00Z", now)).toBe(0.9);
    expect(refundShare("2026-10-01T05:00:00Z", now)).toBe(0.5);
    expect(refundShare("2026-10-01T00:30:00Z", now)).toBe(0);
  });

  it("validates orders", () => {
    const day = addDays(6);
    const [a] = searchTrips("RUE", "DMS", day, today);
    const [b] = searchTrips("DMS", "RUE", addDays(8), today);
    const leg = (tripId: string, seats: string[], cls: "economy" | "business" = "economy") => ({ tripId, cls, seats });
    const p = [manual("SARA ALI", "A1234567"), manual("OMAR ALI", "B1234567", "child")];
    const priced = priceOrder({ legs: [leg(a.id, ["C2-1A", "C2-1B"]), leg(b.id, ["C3-1A", "C3-1B"])], passengers: p });
    expect(priced.totalSAR).toBe(a.fares.economy.adult + a.fares.economy.child + b.fares.economy.adult + b.fares.economy.child);
    expect(() => priceOrder({ legs: [leg(a.id, ["C2-1A"])], passengers: p })).toThrow("invalidSeats");
    expect(() => priceOrder({ legs: [leg(a.id, ["C1-1A", "C1-1B"])], passengers: p })).toThrow("invalidSeats"); // business seats, economy class
    expect(() => priceOrder({ legs: [leg(a.id, ["C2-1A"])], passengers: [manual("OMAR ALI", "B1", "child")] })).toThrow("adultRequired");
    expect(() => priceOrder({ legs: [leg(a.id, ["C2-1A", "C2-1B"]), leg(a.id, ["C3-1A", "C3-1B"])], passengers: p })).toThrow("invalidReturn");
    expect(() => priceOrder({ legs: [leg("x", ["C2-1A"])], passengers: p.slice(0, 1) })).toThrow("invalidTrip");
  });
});

describe("train orders", () => {
  it("books a return trip, holds seats per train and cancels with SAR's fees", async () => {
    const [a] = searchTrips("JSL", "MDN", addDays(10), today);
    const [b] = searchTrips("MDN", "JSL", addDays(12), today);
    const buyer = user(`tr-${run}`);
    const sa = await freeSeats(a.runId, "business", 2);
    const sb = await freeSeats(b.runId, "economy", 2);
    const passengers = [manual("SARA ALI", `P${run}1`), manual("OMAR ALI", `P${run}2`, "child")];
    const legs = [{ tripId: a.id, cls: "business" as const, seats: sa }, { tripId: b.id, cls: "economy" as const, seats: sb }];
    const total = priceOrder({ legs, passengers }).totalSAR;
    const input = { legs, passengers, expectedTotalSAR: total, idempotencyKey: `k-${run}`, card };

    await expect(placeTrainOrder(buyer, { ...input, passengers: [passengers[0], passengers[0]] })).rejects.toMatchObject({ code: "duplicatePassenger" });
    await expect(placeTrainOrder(buyer, { ...input, passengers: [passengers[0], { type: "adult", nameEn: "X", nationality: "EG", passportNo: "A1" }] })).rejects.toMatchObject({ code: "invalidPassenger" });
    await expect(placeTrainOrder(buyer, { ...input, card: { ...card, number: "4000000000000002" } })).rejects.toMatchObject({ code: "payment_declined" });
    expect(await unavailableSeats(a.runId, "business")).not.toContain(sa[0]); // released after the declined payment

    const order = await placeTrainOrder(buyer, input);
    expect(order.tickets).toHaveLength(4);
    expect(order.passengers[0]).toMatchObject({ nameEn: "SARA ALI", passportMasked: `•••${`P${run}1`.toUpperCase().slice(-4)}` });
    expect(JSON.stringify(order)).not.toContain(`P${run}1`.toUpperCase()); // passport kept masked
    expect(await placeTrainOrder(buyer, input)).toEqual(order);
    expect(await unavailableSeats(a.runId, "business")).toEqual(expect.arrayContaining(sa));
    await expect(placeTrainOrder(user(`tr2-${run}`), { ...input, idempotencyKey: `k2-${run}` })).rejects.toMatchObject({ code: "seatUnavailable" });
    // The outbound seats of the failed second order stay with the first order.
    expect(await unavailableSeats(a.runId, "business")).toEqual(expect.arrayContaining(sa));
    expect(await getTrainOrder(`tr2-${run}`, order.id)).toBeNull();
    expect((await listTrainOrders(buyer.id)).map((o) => o.id)).toEqual([order.id]);

    const q = refundQuote(order);
    expect(q.refundSAR).toBe(Math.round(total * 0.9 * 100) / 100);
    expect(canCancelTrain(order, new Date(Date.parse(a.depart) - 30 * 60_000))).toBe(false);
    const done = await cancelTrainOrder(buyer, order.id);
    expect(done.status).toBe("CANCELLED");
    expect(done.cancellation).toMatchObject({ refundSAR: q.refundSAR, feeSAR: q.feeSAR });
    expect(await unavailableSeats(a.runId, "business")).not.toContain(sa[0]);
    await expect(cancelTrainOrder(buyer, order.id)).rejects.toMatchObject({ code: "notCancellable" });
  });
});
