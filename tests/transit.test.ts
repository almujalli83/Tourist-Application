import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { SAMPLE_STATIONS } from "@/lib/metro/provider";
import { sandboxArrivals, sandboxJourneys, transitProvider } from "@/lib/transit/provider";
import { activateTicket, buyTickets, getTicket, listProducts, listTickets, planJourneys, topUpCard } from "@/lib/transit/transit";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const card = { holder: "SARA ALI", number: "4111111111111111", expMonth: "12", expYear: "30", cvc: "123" };
const now = new Date("2026-10-01T09:00:00Z");
const KAFD = { name: "KAFD tower", lat: 24.7665, lng: 46.6425 };
const HOKM = { name: "Qasr Al Hokm", lat: 24.6312, lng: 46.7125 };
const KSU = { name: "King Saud University", lat: 24.7160, lng: 46.6200 };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TRANSIT_PROVIDERS;
});

describe("journey planner (sandbox on the metro network)", () => {
  it("finds a direct metro journey and a bus, with walking and times", () => {
    const js = sandboxJourneys(SAMPLE_STATIONS, KAFD, HOKM, "2026-10-01T12:00");
    const metro = js.find((j) => j.legs.some((l) => l.mode === "metro"))!;
    expect(metro.changes).toBe(0);
    expect(metro.legs.map((l) => l.mode)).toEqual(["walk", "metro", "walk"]);
    expect(metro.legs[1]).toMatchObject({ line: "1", lineNameEn: "Blue Line", from: { name: "KAFD" }, to: { name: "Qasr Al Hokm" } });
    expect(metro.legs[1].departAt >= metro.legs[0].arriveAt).toBe(true);
    expect(metro.departAt).toBe("2026-10-01T12:00");
    expect(js.some((j) => j.legs.some((l) => l.mode === "bus"))).toBe(true);
    expect(js.every((j, i) => i === 0 || j.arriveAt >= js[i - 1].arriveAt)).toBe(true);
  });

  it("changes lines at an interchange", () => {
    const js = sandboxJourneys(SAMPLE_STATIONS, KSU, HOKM, "2026-10-01T12:00");
    const change = js.find((j) => j.changes === 1)!;
    const rides = change.legs.filter((l) => l.mode === "metro");
    expect(rides.map((l) => l.line)).toEqual(["2", "1"]);
    expect(rides[0].to.name).toBe("STC");
    expect(rides[1].departAt >= rides[0].arriveAt).toBe(true);
  });

  it("lists departures near a place, soonest first", () => {
    const a = sandboxArrivals(SAMPLE_STATIONS, { lat: 24.6952, lng: 46.6843 }, now);
    expect(a.length).toBeGreaterThan(2);
    expect(a.some((x) => x.mode === "metro" && x.stopName === "Olaya")).toBe(true);
    expect(a.some((x) => x.mode === "bus")).toBe(true);
    expect(a.every((x, i) => i === 0 || x.inMins >= a[i - 1].inMins)).toBe(true);
    expect(a.every((x) => x.realtime === false)).toBe(true);
  });

  it("plans through the service and validates places", async () => {
    await expect(planJourneys("RUH", { from: KAFD, to: { name: "x" } as never }, now)).rejects.toMatchObject({ code: "invalidPlace" });
    await expect(planJourneys("JED", { from: KAFD, to: HOKM }, now)).rejects.toMatchObject({ code: "noOperator" });
  });
});

describe("tickets and top-ups", () => {
  it("buys tickets (price checked, card charged, codes from the operator), activates one", async () => {
    const u = user("tt-1");
    const { products, operator } = await listProducts("RUH");
    expect(operator.sandbox).toBe(true);
    const p = products.find((x) => x.id === "2h")!;
    await expect(buyTickets(u, { city: "RUH", productId: "2h", qty: 2, expectedTotalSAR: 1, card }, now)).rejects.toMatchObject({ code: "priceChanged" });
    await expect(buyTickets(u, { city: "RUH", productId: "2h", qty: 2, expectedTotalSAR: p.priceSAR * 2, card: { ...card, number: "4000000000000002" } }, now)).rejects.toMatchObject({ code: "declined" });
    await expect(buyTickets(u, { city: "RUH", productId: "2h", qty: 11, expectedTotalSAR: p.priceSAR * 11, card }, now)).rejects.toMatchObject({ code: "invalidQty" });
    const ts = await buyTickets(u, { city: "RUH", productId: "2h", qty: 2, expectedTotalSAR: p.priceSAR * 2, card }, now);
    expect(ts).toHaveLength(2);
    expect(ts[0]).toMatchObject({ status: "unused", validityMins: 120, sandbox: true });
    expect(ts[0].code).not.toBe(ts[1].code);
    const a = await activateTicket(u.id, ts[0].id, now);
    expect(a.status).toBe("active");
    expect(Date.parse(a.validUntil!) - now.getTime()).toBe(120 * 60_000);
    await expect(activateTicket(u.id, ts[0].id, now)).rejects.toMatchObject({ code: "alreadyActivated" });
    await expect(activateTicket("someone-else", ts[1].id, now)).rejects.toMatchObject({ code: "notFound" });
    expect((await getTicket(u.id, ts[0].id, new Date(now.getTime() + 121 * 60_000)))!.status).toBe("expired");
    expect((await listTickets(u.id, now)).length).toBe(2);
  });

  it("refunds when the operator refuses; links operators by API", async () => {
    process.env.TRANSIT_PROVIDERS = JSON.stringify([{ city: "RUH", nameEn: "RPT", url: "https://api.rpt.test/v1", token: "k" }]);
    const f = vi.fn(async (url: string) => {
      if (url.endsWith("/products")) return new Response(JSON.stringify([{ id: "p1", nameEn: "2 hours", priceSAR: 4, validityMins: 120 }, { id: "bad", priceSAR: 0 }]), { status: 200 });
      if (url.endsWith("/orders")) return new Response("{}", { status: 422 });
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    expect(transitProvider("RUH")!.sandbox).toBe(false);
    const { products } = await listProducts("RUH");
    expect(products.map((p) => p.id)).toEqual(["p1"]);
    await expect(buyTickets(user("tt-2"), { city: "RUH", productId: "p1", qty: 1, expectedTotalSAR: 4, card }, now)).rejects.toMatchObject({ code: "operatorRejected" });
    expect(await listTickets("tt-2", now)).toHaveLength(0);
    const [url, init] = f.mock.calls.find((c) => String(c[0]).endsWith("/orders")) as unknown as [string, RequestInit];
    expect(url).toBe("https://api.rpt.test/v1/orders");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("tops up the transit card", async () => {
    const u = user("tt-3");
    await expect(topUpCard(u, { city: "RUH", cardNo: "12", amountSAR: 20, card }, now)).rejects.toMatchObject({ code: "invalidCardNo" });
    await expect(topUpCard(u, { city: "RUH", cardNo: "1234567890", amountSAR: 7, card }, now)).rejects.toMatchObject({ code: "invalidAmount" });
    const t = await topUpCard(u, { city: "RUH", cardNo: "1234 5678 90", amountSAR: 20, card }, now);
    expect(t).toMatchObject({ cardNo: "••••7890", amountSAR: 20 });
    expect(t.balanceSAR).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(t)).not.toContain("1234567890");
  });
});
