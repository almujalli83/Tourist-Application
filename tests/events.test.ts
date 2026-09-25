import { describe, expect, it } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { listCatalog, providerSoldSeat, seatId } from "@/lib/events/catalog";
import {
  availability, buildLines, canCancel, cancelOrder, cancellationDeadline, EventOrderError, eventsCatalog, getOrder, listOrders, openSessions, placeOrder,
} from "@/lib/events/orders";
import { createSeason, sanitizeSeason, SEED_SEASONS, updateSeason } from "@/lib/events/seasons";
import type { EventItem, Season } from "@/lib/events/types";

const run = Math.random().toString(36).slice(2, 8);
const card = { holder: "Test User", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const seasons: Season[] = SEED_SEASONS.map((s) => ({ ...s, status: "published", updatedAt: "" }));

async function freeSeats(e: EventItem, sessionId: string, n: number) {
  const { unavailable } = await availability(e, sessionId);
  const out: string[] = [];
  for (const sec of e.sections!) for (let r = 0; r < sec.rows; r++) for (let k = 1; k <= sec.seatsPerRow; k++) {
    const id = seatId(sec.id, r, k);
    if (!unavailable.includes(id) && out.length < n) out.push(id);
  }
  return out;
}

describe("events catalogue", () => {
  it("builds sessions inside each season and hides events of hidden seasons", () => {
    const cat = listCatalog(seasons, "2026-09-25");
    const tantora = cat.filter((e) => e.seasonId === "winter-at-tantora");
    expect(tantora.length).toBeGreaterThan(0);
    for (const e of tantora) for (const s of e.sessions) {
      const day = new Date(Date.parse(s.start) + 3 * 3_600_000).toISOString().slice(0, 10);
      expect(day >= "2026-12-17" && day <= "2027-02-13").toBe(true);
    }
    const hidden = seasons.map((s) => (s.id === "riyadh-season" ? { ...s, status: "hidden" as const } : s));
    expect(listCatalog(hidden, "2026-09-25").some((e) => e.seasonId === "riyadh-season")).toBe(false);
    // Sessions start in Saudi time: 21:00 in Riyadh is 18:00 UTC.
    const concert = cat.find((e) => e.id === "ruh-boulevard-concert")!;
    expect(concert.sessions[0].start.slice(11, 16)).toBe("18:00");
    expect(new Set(cat.flatMap((e) => e.sessions.map((s) => s.id))).size).toBe(cat.reduce((a, e) => a + e.sessions.length, 0));
  });

  it("validates ticket requests", () => {
    const cat = listCatalog(seasons, "2026-09-25");
    const seated = cat.find((e) => e.seating === "seated")!;
    const general = cat.find((e) => e.seating === "general" && e.ticketTypes!.length > 1)!;
    expect(buildLines(seated, [`${seated.sections![0].id}-A1`, `${seated.sections![0].id}-A1`])).toHaveLength(1);
    expect(() => buildLines(seated, ["zzz-A1"])).toThrow("invalidTickets");
    expect(() => buildLines(seated, [`${seated.sections![0].id}-Z99`])).toThrow("invalidTickets");
    expect(() => buildLines(seated, [])).toThrow("noTickets");
    const [a, b] = general.ticketTypes!;
    const lines = buildLines(general, [], { [a.id]: 2, [b.id]: 1 });
    expect(lines.map((l) => l.priceSAR)).toEqual([a.priceSAR, a.priceSAR, b.priceSAR]);
    expect(() => buildLines(general, [], { [a.id]: general.maxPerOrder + 1 })).toThrow("tooManyTickets");
    expect(() => buildLines(general, [], { [a.id]: 1.5 })).toThrow("invalidTickets");
  });

  it("validates seasons", async () => {
    const base = { nameAr: "موسم", nameEn: `Test Season ${run}`, startDate: "2027-01-01", endDate: "2027-02-01", cities: ["RUH", "XXX"] };
    expect(sanitizeSeason(base, "x").cities).toEqual(["RUH"]);
    expect(() => sanitizeSeason({ ...base, endDate: "2026-12-01" }, "x")).toThrow("invalidDates");
    expect(() => sanitizeSeason({ ...base, cities: [] }, "x")).toThrow("citiesRequired");
    const created = await createSeason(base);
    expect(created.id).toBe(`test-season-${run}`);
    await expect(createSeason(base)).rejects.toThrow("duplicate");
    expect((await updateSeason(created.id, { status: "hidden" }))?.status).toBe("hidden");
  });
});

describe("event orders", () => {
  it("sells seats once, charges the card, issues tickets and cancels under the policy", async () => {
    const e = (await eventsCatalog()).find((x) => x.id === "ruh-comedy-show")!; // seated, refundable 48 h
    const session = openSessions(e)[0];
    const seats = await freeSeats(e, session.id, 2);
    const total = seats.reduce((a, s) => a + e.sections!.find((x) => s.startsWith(`${x.id}-`))!.priceSAR, 0);
    const buyer = user(`ev-${run}`);
    const input = { eventId: e.id, sessionId: session.id, seats, expectedTotalSAR: total, idempotencyKey: `k1-${run}`, card };

    await expect(placeOrder(buyer, { ...input, expectedTotalSAR: total - 1 })).rejects.toMatchObject({ code: "priceChanged" });
    await expect(placeOrder(buyer, { ...input, card: { ...card, number: "4000000000000002" } })).rejects.toMatchObject({ code: "payment_declined" });
    // A declined payment releases the seats.
    expect((await availability(e, session.id)).unavailable).not.toContain(seats[0]);

    const order = await placeOrder(buyer, input);
    expect(order.status).toBe("CONFIRMED");
    expect(order.tickets.map((t) => t.line.seat)).toEqual(seats);
    expect(order.tickets.every((t) => /^WB-[0-9A-F]{12}$/.test(t.code))).toBe(true);
    expect(order.holderName).toBe("Sara Ali");
    expect(await placeOrder(buyer, input)).toEqual(order); // same request again → same order, not charged twice
    expect((await availability(e, session.id)).unavailable).toEqual(expect.arrayContaining(seats));

    const other = user(`ev2-${run}`);
    await expect(placeOrder(other, { ...input, idempotencyKey: `k2-${run}` })).rejects.toMatchObject({ code: "seatUnavailable" });
    expect(await getOrder(other.id, order.id)).toBeNull();
    expect((await listOrders(buyer.id)).map((o) => o.id)).toEqual([order.id]);

    expect(cancellationDeadline(order)).toBe(new Date(Date.parse(session.start) - 48 * 3_600_000).toISOString());
    expect(canCancel(order, new Date(Date.parse(session.start) - 47 * 3_600_000))).toBe(false);
    const cancelled = await cancelOrder(buyer, order.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancellation?.refundSAR).toBe(total);
    expect((await availability(e, session.id)).unavailable).not.toContain(seats[0]);
    await expect(cancelOrder(buyer, order.id)).rejects.toMatchObject({ code: "notCancellable" });
  });

  it("counts general admission tickets and keeps final tickets final", async () => {
    const e = (await eventsCatalog()).find((x) => x.id === "ruh-boulevard-entry")!;
    const session = openSessions(e)[1];
    const before = (await availability(e, session.id)).remaining;
    const buyer = user(`ga-${run}`);
    const order = await placeOrder(buyer, { eventId: e.id, sessionId: session.id, quantities: { adult: 2, child: 1 }, expectedTotalSAR: 125, idempotencyKey: `g-${run}`, card });
    expect(order.tickets).toHaveLength(3);
    const after = (await availability(e, session.id)).remaining;
    expect(after.adult).toBe(before.adult - 2);
    expect(after.child).toBe(before.child - 1);

    const final = (await eventsCatalog()).find((x) => x.id === "ruh-fight-night");
    if (final) {
      const s = openSessions(final)[0];
      const seats = await freeSeats(final, s.id, 1);
      const price = final.sections!.find((x) => seats[0].startsWith(`${x.id}-`))!.priceSAR;
      const o = await placeOrder(buyer, { eventId: final.id, sessionId: s.id, seats, expectedTotalSAR: price, idempotencyKey: `f-${run}`, card });
      expect(cancellationDeadline(o)).toBeNull();
      await expect(cancelOrder(buyer, o.id)).rejects.toBeInstanceOf(EventOrderError);
    }
  });

  it("closes sales two hours before the session", async () => {
    const e = (await eventsCatalog())[0];
    const s = e.sessions[0];
    const late = new Date(Date.parse(s.start) - 60 * 60_000);
    expect(openSessions(e, late).some((x) => x.id === s.id)).toBe(false);
    await expect(placeOrder(user(`late-${run}`), { eventId: e.id, sessionId: s.id, quantities: {}, seats: [], expectedTotalSAR: 0, idempotencyKey: `l-${run}`, card }, late)).rejects.toMatchObject({ code: "sessionClosed" });
    expect(typeof providerSoldSeat(s.id, "x-A1")).toBe("boolean");
  });
});
