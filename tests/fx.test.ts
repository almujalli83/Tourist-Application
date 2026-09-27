import { afterEach, describe, expect, it, vi } from "vitest";
import { convertFromSAR, convertToSAR, formatMoney, getCurrency, setLiveRates } from "@/lib/currency";
import { getRates, parseRates, resetFxCache, SAR_PER_USD } from "@/lib/fx";
import { store } from "@/lib/store";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FX_RATES_URL;
  setLiveRates(null);
  resetFxCache();
});

describe("exchange rates", () => {
  it("reads a SAR-based feed, keeping only offered currencies with sane values", () => {
    const r = parseRates({ base_code: "SAR", rates: { SAR: 1, USD: 0.2667, EUR: 0.24, CNY: 1.93, XYZ: 5, GBP: 99 } })!;
    expect(r).toMatchObject({ SAR: 1, USD: 0.2667, EUR: 0.24, CNY: 1.93 });
    expect(r.XYZ).toBeUndefined();
    expect(r.GBP).toBeUndefined(); // 99 per SAR is absurd: dropped
  });

  it("converts a USD- or EUR-based feed through the SAR peg", () => {
    const usd = parseRates({ base: "USD", rates: { EUR: 0.92, GBP: 0.78, JPY: 150, CNY: 7.1, INR: 84, AED: 3.6725 } })!;
    expect(usd.USD).toBeCloseTo(1 / SAR_PER_USD, 6);
    expect(usd.JPY).toBeCloseTo(40, 6);
    const eur = parseRates({ base: "EUR", rates: { USD: 1.08, GBP: 0.85, JPY: 162, CNY: 7.7, INR: 90 } })!;
    expect(eur.USD).toBeCloseTo(1 / SAR_PER_USD, 6);
    expect(eur.EUR).toBeCloseTo(1 / 1.08 / SAR_PER_USD, 6);
    expect(parseRates({ nope: 1 })).toBeNull();
  });

  it("fetches, keeps and falls back to built-in rates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const b = await getRates(new Date("2026-10-01T00:00:00Z"));
    expect(b).toMatchObject({ live: false, source: "built-in" });
    resetFxCache();
    process.env.FX_RATES_URL = "https://fx.test/latest/SAR";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ base_code: "SAR", rates: { SAR: 1, USD: 0.2667, EUR: 0.25, GBP: 0.21, CNY: 1.95, JPY: 41, INR: 23 } }), { status: 200 })));
    const l = await getRates(new Date("2026-10-01T01:00:00Z"));
    expect(l).toMatchObject({ live: true, source: "fx.test", rates: { EUR: 0.25 } });
    resetFxCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const kept = await getRates(new Date("2026-10-02T02:00:00Z")); // stale, source down: kept copy
    expect(kept.rates.EUR).toBe(0.25);
    await store().delete("config", "fxRates");
  });

  it("applies live rates to prices and the converter", () => {
    expect(convertFromSAR(100, "EUR")).toBe(Math.round(100 * getCurrency("EUR").perSAR * 100) / 100);
    setLiveRates({ SAR: 1, EUR: 0.3 });
    expect(convertFromSAR(100, "EUR")).toBe(30);
    expect(convertToSAR(30, "EUR")).toBe(100);
    expect(formatMoney(100, "EUR", "en")).toBe("€30.00");
    expect(convertFromSAR(100, "JPY")).toBe(4000); // not in the feed: built-in rate
  });
});
