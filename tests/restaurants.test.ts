import { describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import {
  availability, bookTable, canCancelTable, cancelTableBooking, changeDelta, changeTableBooking, feeFor, getTableBooking, listTableBookings, RestaurantBookingError,
} from "@/lib/restaurants/bookings";
import { getRestaurant, listRestaurants, seatingTimes } from "@/lib/restaurants/catalog";

const run = Math.random().toString(36).slice(2, 8);
const card = { holder: "Test User", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "en", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const day = (n: number) => new Date(Date.now() + n * 86_400_000 + 3 * 3_600_000).toISOString().slice(0, 10);

async function freeTime(rid: string, d: string, party: number) {
  const r = getRestaurant(rid)!;
  return (await availability(r, d)).find((s) => s.bookable && s.left >= party)!.time;
}

describe("restaurants catalogue", () => {
  it("has seating times inside opening hours, every 30 minutes, last seating an hour before closing", () => {
    const r = getRestaurant("ruh-kafd-omakase")!; // 18:00–23:30
    const times = seatingTimes(r, day(3));
    expect(times[0]).toBe("18:00");
    expect(times.at(-1)).toBe("22:30");
    expect(times).toContain("19:30");
    for (const x of listRestaurants()) expect(seatingTimes(x, day(3)).length).toBeGreaterThan(0);
    expect(listRestaurants().some((x) => x.policy.feePerGuestSAR === 0)).toBe(true);
    expect(listRestaurants().some((x) => x.policy.feePerGuestSAR > 0)).toBe(true);
  });
});

describe("table bookings", () => {
  it("books free tables, holds covers, changes and cancels", async () => {
    const r = getRestaurant("ruh-najd-heritage")!; // free
    const d = day(4);
    const buyer = user(`rs-${run}`);
    const time = await freeTime(r.id, d, 4);
    const leftBefore = (await availability(r, d)).find((s) => s.time === time)!.left;
    const input = { restaurantId: r.id, day: d, time, party: 4, expectedFeeSAR: 0, idempotencyKey: `k-${run}` };

    await expect(bookTable(buyer, { ...input, party: r.maxParty + 1 })).rejects.toMatchObject({ code: "invalidParty" });
    await expect(bookTable(buyer, { ...input, time: "03:00" })).rejects.toMatchObject({ code: "invalidTime" });
    await expect(bookTable(buyer, { ...input, day: day(40) })).rejects.toMatchObject({ code: "invalidDate" });

    const b = await bookTable(buyer, input);
    expect(b).toMatchObject({ status: "CONFIRMED", party: 4, guestName: "Sara Ali", fee: { paidSAR: 0, payment: null } });
    expect(b.code).toMatch(/^MTR-[0-9A-F]{12}$/);
    expect(await bookTable(buyer, input)).toEqual(b);
    expect((await availability(r, d)).find((s) => s.time === time)!.left).toBe(leftBefore - 4);

    // Change to another day and party size: covers move with it.
    const d2 = day(5);
    const t2 = await freeTime(r.id, d2, 6);
    const changed = await changeTableBooking(buyer, b.id, { day: d2, time: t2, party: 6, expectedDeltaSAR: 0 });
    expect(changed).toMatchObject({ day: d2, time: t2, party: 6 });
    expect(changed.changes).toHaveLength(1);
    expect((await availability(r, d)).find((s) => s.time === time)!.left).toBe(leftBefore);

    expect(canCancelTable(changed, new Date(Date.parse(changed.start) - 60 * 60_000))).toBe(false); // within the 2 h cut-off
    const cancelled = await cancelTableBooking(buyer, b.id);
    expect(cancelled.status).toBe("CANCELLED");
    await expect(cancelTableBooking(buyer, b.id)).rejects.toBeInstanceOf(RestaurantBookingError);
    expect(await getTableBooking(`other-${run}`, b.id)).toBeNull();
    expect((await listTableBookings(buyer.id)).map((x) => x.id)).toEqual([b.id]);
  });

  it("charges the booking fee per guest, adjusts it on change and refunds it on cancel", async () => {
    const r = getRestaurant("ruh-trattoria-diriyah")!; // 100 SAR per guest
    const d = day(6);
    const buyer = user(`fee-${run}`);
    const time = await freeTime(r.id, d, 2);
    const input = { restaurantId: r.id, day: d, time, party: 2, expectedFeeSAR: feeFor(r, 2), idempotencyKey: `f-${run}` };
    expect(input.expectedFeeSAR).toBe(200);
    await expect(bookTable(buyer, input)).rejects.toMatchObject({ code: "cardRequired" });
    await expect(bookTable(buyer, { ...input, expectedFeeSAR: 100, card })).rejects.toMatchObject({ code: "priceChanged" });
    await expect(bookTable(buyer, { ...input, card: { ...card, number: "4000000000000002" } })).rejects.toMatchObject({ code: "payment_declined" });

    const b = await bookTable(buyer, { ...input, card });
    expect(b.fee).toMatchObject({ perGuestSAR: 100, paidSAR: 200 });
    expect(changeDelta(b, 3)).toBe(100);
    const t3 = await freeTime(r.id, d, 3);
    await expect(changeTableBooking(buyer, b.id, { day: d, time: t3, party: 3, expectedDeltaSAR: 100 })).rejects.toMatchObject({ code: "cardRequired" });
    const up = await changeTableBooking(buyer, b.id, { day: d, time: t3, party: 3, expectedDeltaSAR: 100, card });
    expect(up.fee.paidSAR).toBe(300);
    const down = await changeTableBooking(buyer, b.id, { day: d, time: t3, party: 1, expectedDeltaSAR: -200 });
    expect(down.fee.paidSAR).toBe(100);
    expect(down.changes.at(-1)).toMatchObject({ refundedSAR: 200 });
    const c = await cancelTableBooking(buyer, b.id);
    expect(c.cancellation?.refundSAR).toBe(100);
  });

  it("refuses a full time slot", async () => {
    const r = getRestaurant("ruh-kafd-omakase")!; // 12 covers per slot
    const d = day(7);
    const slot = (await availability(r, d)).find((s) => s.bookable && s.left > 0 && s.left <= r.maxParty)!;
    await bookTable(user(`full-${run}`), { restaurantId: r.id, day: d, time: slot.time, party: slot.left, expectedFeeSAR: feeFor(r, slot.left), idempotencyKey: `a-${run}`, card });
    await expect(bookTable(user(`full2-${run}`), { restaurantId: r.id, day: d, time: slot.time, party: 1, expectedFeeSAR: feeFor(r, 1), idempotencyKey: `b-${run}`, card })).rejects.toMatchObject({ code: "slotFull" });
  });
});
