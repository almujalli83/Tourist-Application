import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_FILE = join(mkdtempSync(join(tmpdir(), "metro-")), "db.json");

const { linesOf, parseStations, getMetro, syncMetro, resetMetroCache, SAMPLE_STATIONS } = await import("../src/lib/metro/provider");
const { metroLeg, nearestStation } = await import("../src/lib/metro/types");

const geojson = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [46.6431, 24.7672] }, properties: { station_name: "KAFD", station_name_ar: "المركز المالي", metro_line: "Line 1", station_type: "Elevated" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.6433, 24.7673] }, properties: { station_name: "KAFD", station_name_ar: "المركز المالي", metro_line: "Line 4", station_type: "Elevated" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.6843, 24.6952] }, properties: { station_name: "Olaya", station_name_ar: "العليا", metro_line: "1" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.7109, 24.6475] }, properties: { station_name: "National Museum", metro_line: "Blue line, Green line" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.7131, 24.6307] }, properties: { station_name: "Qasr Al Hokm", metro_line: "1, 3" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.6196, 24.7163] }, properties: { station_name: "KSU", metro_line: "2" } },
    // Wrong axis order and a record without a line are dropped.
    { type: "Feature", geometry: { type: "Point", coordinates: [24.7, 46.7] }, properties: { station_name: "Bad", metro_line: "1" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [46.7, 24.7] }, properties: { station_name: "No line" } },
  ],
};

describe("metro open data", () => {
  it("reads line numbers and colours", () => {
    expect(linesOf("Line 3")).toEqual([3]);
    expect(linesOf("الخط الأزرق")).toEqual([1]);
    expect(linesOf(["1, 4", "Purple"])).toEqual([1, 4, 6]);
    expect(linesOf("Line 9")).toEqual([]);
  });

  it("parses GeoJSON, merges interchanges and drops bad records", () => {
    const s = parseStations(geojson);
    expect(s.map((x) => x.nameEn)).toEqual(["KAFD", "Olaya", "National Museum", "Qasr Al Hokm", "KSU"]);
    expect(s[0]).toMatchObject({ nameAr: "المركز المالي", lines: [1, 4], lat: 24.7672, lng: 46.6431 });
    expect(s[2].lines).toEqual([1, 5]);
    expect(s[2].nameAr).toBe("National Museum"); // no Arabic name in the data: the English one
  });

  it("parses JSON records with geo_point_2d", () => {
    const s = parseStations([{ name: "Olaya", line: 1, geo_point_2d: { lon: 46.6843, lat: 24.6952 } }, { name: "STC", line: "1-2", geo_point_2d: { lon: 46.6635, lat: 24.7266 } }]);
    expect(s).toHaveLength(2);
    expect(s[1].lines).toEqual([1, 2]);
  });
});

describe("metro network", () => {
  beforeEach(() => resetMetroCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.METRO_STATIONS_URL;
  });

  it("falls back to the sample network in the sandbox when the link is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const net = await getMetro(new Date("2026-09-27T10:00:00Z"));
    expect(net.source).toBe("sample");
    expect(net.stations).toBe(SAMPLE_STATIONS);
  });

  it("syncs from the open-data link, keeps it and refreshes weekly", async () => {
    process.env.METRO_STATIONS_URL = "https://example.test/metro.geojson";
    const f = vi.fn(async () => new Response(JSON.stringify(geojson), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const t0 = new Date("2026-09-27T10:00:00Z");
    const net = await getMetro(t0);
    expect(net.source).toBe("rcrc");
    expect(net.stations).toHaveLength(5);
    expect(f).toHaveBeenCalledWith("https://example.test/metro.geojson", expect.anything());
    resetMetroCache();
    await getMetro(new Date(t0.getTime() + 86_400_000));
    expect(f).toHaveBeenCalledTimes(1); // kept copy
    // A week later the source is down: the kept copy stays.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    resetMetroCache();
    const later = await getMetro(new Date(t0.getTime() + 8 * 86_400_000));
    expect(later.source).toBe("rcrc");
    expect(later.stations).toHaveLength(5);
  });

  it("rejects an empty source", async () => {
    process.env.METRO_STATIONS_URL = "https://example.test/empty";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ features: [] }), { status: 200 })));
    await expect(syncMetro()).rejects.toThrow();
  });
});

describe("metro legs", () => {
  const stations = parseStations(geojson);
  it("finds the nearest station with the walk", () => {
    const n = nearestStation(stations, { lat: 24.6960, lng: 46.6850 })!;
    expect(n.station.nameEn).toBe("Olaya");
    expect(n.walkMins).toBeLessThan(5);
  });

  it("suggests the metro between places near stations on the same line", () => {
    const leg = metroLeg(stations, { lat: 24.7660, lng: 46.6440 }, { lat: 24.6310, lng: 46.7120 })!;
    expect(leg.from.nameEn).toBe("KAFD");
    expect(leg.to.nameEn).toBe("Qasr Al Hokm");
    expect(leg.line).toBe(1);
    expect(leg.mins).toBeGreaterThan(15);
  });

  it("no metro when far from a station, on different lines, or for short hops", () => {
    expect(metroLeg(stations, { lat: 24.80, lng: 46.60 }, { lat: 24.6310, lng: 46.7120 })).toBeNull();
    expect(metroLeg(stations, { lat: 24.7163, lng: 46.6200 }, { lat: 24.6310, lng: 46.7120 })).toBeNull(); // KSU (2) → Hokm (1,3)
    expect(metroLeg(stations, { lat: 24.6475, lng: 46.7109 }, { lat: 24.6307, lng: 46.7131 })).toBeNull(); // < 3 km
  });
});
