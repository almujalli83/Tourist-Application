import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredBooking } from "@/lib/bookings/types";
import { nearbyMosques } from "@/lib/prayer/mosques";
import { hijriDate, isFriday, ksaNow, nextPrayer, prayerTimes, qiblaBearing } from "@/lib/prayer/times";
import { tripCityToday } from "@/lib/prayer/trip";
import { saveBooking } from "@/lib/repo";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PRAYER_MOSQUES_OSM;
  delete process.env.DEMO_PRAYER;
});

describe("prayer times service", () => {
  it("gives the Qibla direction towards the Kaaba", () => {
    expect(qiblaBearing(24.7136, 46.6753)).toBeGreaterThan(240); // Riyadh: west-south-west
    expect(qiblaBearing(24.7136, 46.6753)).toBeLessThan(248);
    expect(qiblaBearing(24.4672, 39.6112)).toBeGreaterThan(172); // Madinah: almost due south
    expect(qiblaBearing(24.4672, 39.6112)).toBeLessThan(180);
    expect(qiblaBearing(21.5433, 39.1728)).toBeGreaterThan(95); // Jeddah: east
    expect(qiblaBearing(21.5433, 39.1728)).toBeLessThan(115);
  });

  it("finds the next prayer, rolling over to tomorrow's Fajr after Isha", () => {
    const t = prayerTimes("2026-10-02", 24.7136, 46.6753);
    const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    expect(nextPrayer("2026-10-02", mins(t.dhuhr) - 10, 24.7136, 46.6753)).toMatchObject({ name: "dhuhr", day: "2026-10-02", inMin: 10 });
    const late = nextPrayer("2026-10-02", mins(t.isha) + 1, 24.7136, 46.6753);
    expect(late).toMatchObject({ name: "fajr", day: "2026-10-03" });
    expect(isFriday("2026-10-02")).toBe(true);
    expect(ksaNow(new Date("2026-10-02T21:30:00Z"))).toEqual({ day: "2026-10-03", min: 30 });
    expect(hijriDate("2026-10-02", "ar")).toMatch(/1448/);
  });

  it("lists the nearest mosques from the guide and OpenStreetMap, marking grand mosques", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      elements: [
        { type: "node", id: 1, lat: 24.7140, lon: 46.6760, tags: { amenity: "place_of_worship", religion: "muslim", name: "جامع الحي" } },
        { type: "way", id: 2, center: { lat: 24.7200, lon: 46.6800 }, tags: { amenity: "place_of_worship", religion: "muslim", "name:en": "Al Noor Mosque" } },
        { type: "node", id: 3, lat: 24.7136, lon: 46.6754, tags: { amenity: "place_of_worship", religion: "muslim" } },
      ],
    }), { status: 200 })));
    const list = await nearbyMosques(24.7136, 46.6753);
    expect(list[0]).toMatchObject({ id: "osm:node/3", nameAr: null, nameEn: null });
    expect(list.find((m) => m.id === "osm:node/1")).toMatchObject({ jami: true, nameAr: "جامع الحي" });
    expect(list.find((m) => m.id === "osm:way/2")).toMatchObject({ jami: false, nameEn: "Al Noor Mosque" });
    expect(list.map((m) => m.km)).toEqual([...list.map((m) => m.km)].sort((a, b) => a - b));
    // OpenStreetMap unavailable or off: the guide's mosques only.
    process.env.PRAYER_MOSQUES_OSM = "off";
    const guide = await nearbyMosques(24.6318, 46.7128);
    expect(guide.every((m) => m.source === "guide")).toBe(true);
    expect(guide[0].nameEn).toBe("Imam Turki bin Abdullah Grand Mosque");
    expect(guide[0].jami).toBe(true);
  });

  it("uses the city of the traveller's trip today, or a sample trip in sandbox", async () => {
    await saveBooking({
      id: "pt-b1", reference: "TA-PRAY", userId: "pt-u1", status: "COMPLETED", mt: { packageStatus: "COMPLETED" },
      criteria: { departureDate: "2026-10-10", returnDate: "2026-10-16", stays: [{ city: "RUH", nights: 3 }, { city: "JED", nights: 3 }] },
    } as unknown as StoredBooking);
    expect(await tripCityToday("pt-u1", new Date("2026-10-11T09:00:00Z"))).toMatchObject({ city: "RUH", reference: "TA-PRAY" });
    expect(await tripCityToday("pt-u1", new Date("2026-10-14T09:00:00Z"))).toMatchObject({ city: "JED" });
    expect(await tripCityToday("pt-u1", new Date("2026-10-16T09:00:00Z"))).toMatchObject({ city: "JED" });
    expect(await tripCityToday("pt-u1", new Date("2026-10-20T09:00:00Z"))).toMatchObject({ demo: true, reference: "TA-DEMO2026" });
    process.env.DEMO_PRAYER = "off";
    expect(await tripCityToday("pt-u1", new Date("2026-10-20T09:00:00Z"))).toBeNull();
  });
});
