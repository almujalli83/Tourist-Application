import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicUser } from "@/lib/auth/types";
import { rideProviders, SANDBOX_ACCEPT_S } from "@/lib/rides/providers";
import { cancelRide, getRide, listRides, requestRide, rideOptions } from "@/lib/rides/rides";

const user = (id: string): PublicUser => ({ id, email: `${id}@example.com`, accountType: "individual", individual: { fullName: "Sara Ali", phone: "+966500000000", nationality: "EG" }, preferredLocale: "ar", preferredCurrency: "SAR", createdAt: "2026-01-01T00:00:00Z" });
const pickup = { name: "Hotel", lat: 24.69, lng: 46.685 };
const dropoff = { name: "Diriyah", lat: 24.7336, lng: 46.5753 };
const now = new Date("2026-10-01T09:00:00Z");
const at = (s: number) => new Date(now.getTime() + s * 1000);

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RIDE_PROVIDERS;
});

describe("ride options", () => {
  it("lists Uber, Careem and Jeeny options by category, cheapest first", async () => {
    const o = await rideOptions({ pickup, dropoff });
    expect(new Set(o.map((x) => x.providerId))).toEqual(new Set(["uber", "careem", "jeeny"]));
    expect(o[0].category).toBe("economy");
    const eco = o.filter((x) => x.category === "economy");
    expect(eco.every((x, i) => i === 0 || x.minSAR >= eco[i - 1].minSAR)).toBe(true);
    expect(o.find((x) => x.providerId === "uber" && x.category === "family")).toMatchObject({ product: "UberXL", seats: 6 });
    await expect(rideOptions({ pickup: { name: "x", lat: 51.5, lng: -0.1 }, dropoff })).rejects.toMatchObject({ code: "invalidPlace" });
  });

  it("links companies by API", async () => {
    process.env.RIDE_PROVIDERS = JSON.stringify([{ id: "uber", nameAr: "أوبر", nameEn: "Uber", color: "#000000", url: "https://api.uber.test/v1", token: "t" }]);
    const f = vi.fn(async () => new Response(JSON.stringify([{ optionId: "u1", category: "economy", product: "UberX", minSAR: 30, maxSAR: 38, etaMins: 4 }, { optionId: "x", category: "boat", minSAR: 1 }]), { status: 200 }));
    vi.stubGlobal("fetch", f);
    expect(rideProviders().map((p) => p.id)).toEqual(["uber"]);
    const o = await rideOptions({ pickup, dropoff });
    expect(o).toEqual([expect.objectContaining({ optionId: "u1", providerNameAr: "أوبر", minSAR: 30, maxSAR: 38 })]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.uber.test/v1/estimates");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer t");
  });
});

describe("ride lifecycle (sandbox)", () => {
  it("requests, finds a driver who drives to the pickup and the destination, then ends with a fare", async () => {
    const u = user("rd-1");
    const o = (await rideOptions({ pickup, dropoff })).find((x) => x.providerId === "careem" && x.category === "economy")!;
    await expect(requestRide(u, { providerId: "careem", optionId: "forged", pickup, dropoff }, now)).rejects.toMatchObject({ code: "optionExpired" });
    const r = await requestRide(u, { providerId: "careem", optionId: o.optionId, pickup, dropoff }, now);
    expect(r).toMatchObject({ status: "searching", providerNameAr: "كريم", product: "Go", minSAR: o.minSAR, sandbox: true });
    expect(JSON.stringify(r)).not.toContain("+966500000000");
    await expect(requestRide(u, { providerId: "uber", optionId: "sbx-uber-economy", pickup, dropoff }, now)).rejects.toMatchObject({ code: "rideInProgress" });
    const a = (await getRide(u.id, r.id, at(SANDBOX_ACCEPT_S + 5)))!;
    expect(["accepted", "arriving"]).toContain(a.status);
    expect(a.driver?.name).toBeTruthy();
    expect(a.driverAt).not.toBeNull();
    const mid = (await getRide(u.id, r.id, at(SANDBOX_ACCEPT_S + 60 * 10 + 60 + 120)))!;
    expect(mid.status).toBe("in_progress");
    const done = (await getRide(u.id, r.id, at(3 * 3600)))!;
    expect(done.status).toBe("completed");
    expect(done.fareSAR).toBeGreaterThan(0);
    await expect(cancelRide(u.id, r.id, at(3 * 3600))).rejects.toMatchObject({ code: "notCancellable" });
    expect((await listRides(u.id, at(3 * 3600)))[0].id).toBe(r.id);
  });

  it("cancels before the trip; no driver after 10 minutes searching", async () => {
    const u = user("rd-2");
    const r = await requestRide(u, { providerId: "jeeny", optionId: "sbx-jeeny-economy", pickup, dropoff }, now);
    expect((await cancelRide(u.id, r.id, at(10))).status).toBe("cancelled");
    await expect(cancelRide("other", r.id, at(10))).rejects.toMatchObject({ code: "notFound" });
    process.env.RIDE_PROVIDERS = JSON.stringify([{ id: "slow", url: "https://api.slow.test", nameEn: "Slow" }]);
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/estimates")) return new Response(JSON.stringify([{ optionId: "s1", category: "economy", minSAR: 20 }]), { status: 200 });
      if (url.endsWith("/rides") && init?.method === "POST") return new Response(JSON.stringify({ ref: "S-1", status: "searching" }), { status: 200 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ status: "searching" }), { status: 200 });
    }));
    const s = await requestRide(u, { providerId: "slow", optionId: "s1", pickup, dropoff }, at(20));
    expect((await getRide(u.id, s.id, at(20 + 11 * 60)))).toMatchObject({ status: "no_driver", cancelReason: "no_driver" });
  });
});
