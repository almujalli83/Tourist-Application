import { afterEach, describe, expect, it } from "vitest";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks, distanceKm } from "@/lib/guide/geo";
import { isOpenNow } from "@/lib/guide/hours";
import { fetchOfficialPlaces, OfficialGuideError } from "@/lib/guide/official";
import { fetchOsmPlaces, mapOsmElement, parseOpeningHours } from "@/lib/guide/osm";
import {
  addImportedPlaces, adminListPlaces, changeFavorites, createPlace, getPlace, publishedPlaces, publishedPlacesByIds, sanitizePlace, updatePlace,
} from "@/lib/guide/repo";
import { matchesQuery, normalizeSearch } from "@/lib/guide/search";
import { seedPlaces } from "@/lib/guide/seed";

const run = Math.random().toString(36).slice(2, 8);
const runNum = Date.now() % 1_000_000_000;
/** A time in Saudi Arabia (UTC+3). 2026-09-27 is a Sunday. */
const ksa = (iso: string) => new Date(`${iso}+03:00`);

afterEach(() => {
  delete process.env.OFFICIAL_GUIDE_URL;
  delete process.env.OFFICIAL_GUIDE_TOKEN;
});

describe("guide helpers", () => {
  it("knows whether a place is open now in Saudi time", () => {
    const day = { hours: [{ days: [0], open: "09:00", close: "17:00" }] };
    expect(isOpenNow(day, ksa("2026-09-27T10:00:00"))).toBe(true);
    expect(isOpenNow(day, ksa("2026-09-27T17:00:00"))).toBe(false);
    expect(isOpenNow(day, ksa("2026-09-28T10:00:00"))).toBe(false); // Monday
    const night = { hours: [{ days: [0], open: "16:00", close: "01:00" }] };
    expect(isOpenNow(night, ksa("2026-09-27T23:30:00"))).toBe(true);
    expect(isOpenNow(night, ksa("2026-09-28T00:30:00"))).toBe(true); // Sunday's slot still running
    expect(isOpenNow(night, ksa("2026-09-28T01:30:00"))).toBe(false);
    expect(isOpenNow({ open24h: true }, new Date())).toBe(true);
    expect(isOpenNow({}, new Date())).toBeNull();
  });

  it("measures distances and builds directions links", () => {
    const km = distanceKm(CITY_CENTERS.RUH, CITY_CENTERS.JED);
    expect(km).toBeGreaterThan(820);
    expect(km).toBeLessThan(870);
    expect(directionsLinks({ lat: 24.1, lng: 46.2 }).google).toBe("https://www.google.com/maps/dir/?api=1&destination=24.1,46.2");
  });

  it("searches Arabic text regardless of hamza, ta marbuta, diacritics and the article", () => {
    expect(normalizeSearch("الدِّرعيّة")).toBe(normalizeSearch("درعيه"));
    expect(normalizeSearch("أبها")).toBe(normalizeSearch("ابها"));
    const p = { nameAr: "قصر المصمك", nameEn: "Masmak Fortress", descriptionAr: "", descriptionEn: "", cuisineEn: "Seafood" };
    expect(matchesQuery(p, "المصمك")).toBe(true);
    expect(matchesQuery(p, "masmak fort")).toBe(true);
    expect(matchesQuery(p, "seafood")).toBe(true);
    expect(matchesQuery(p, "museum")).toBe(false);
  });

  it("starter content is well formed and each place is near its city", () => {
    const seed = seedPlaces();
    expect(new Set(seed.map((p) => p.id)).size).toBe(seed.length);
    for (const p of seed) {
      expect(() => sanitizePlace(p as unknown as Record<string, unknown>)).not.toThrow();
      expect(distanceKm(p, CITY_CENTERS[p.city]), p.nameEn).toBeLessThan(150);
      expect(p.nameAr && p.nameEn && p.descriptionAr && p.descriptionEn).toBeTruthy();
    }
  });

  it("validates places", () => {
    const ok = { city: "RUH", category: "museum", nameAr: "متحف", nameEn: "Museum", lat: 24.6, lng: 46.7 };
    expect(sanitizePlace(ok).status).toBe("draft");
    expect(() => sanitizePlace({ ...ok, city: "XXX" })).toThrow("invalidCity");
    expect(() => sanitizePlace({ ...ok, category: "zoo" })).toThrow("invalidCategory");
    expect(() => sanitizePlace({ ...ok, nameEn: " " })).toThrow("nameRequired");
    expect(() => sanitizePlace({ ...ok, lat: 51.5, lng: -0.1 })).toThrow("invalidLocation");
    const p = sanitizePlace({ ...ok, website: "javascript:alert(1)", hours: [{ days: [9, 1], open: "25:00", close: "10:00" }, { days: [1, 1, 2], open: "09:00", close: "17:00" }], tags: ["family", "bogus"] });
    expect(p.website).toBeUndefined();
    expect(p.hours).toEqual([{ days: [1, 2], open: "09:00", close: "17:00" }]);
    expect(p.tags).toEqual(["family"]);
  });
});

describe("OpenStreetMap import", () => {
  it("parses common opening_hours forms", () => {
    expect(parseOpeningHours("24/7")).toEqual({ open24h: true });
    expect(parseOpeningHours("Mo-Fr 09:00-22:00; Sa,Su 10:00-23:00")).toEqual({
      hours: [{ days: [1, 2, 3, 4, 5], open: "09:00", close: "22:00" }, { days: [0, 6], open: "10:00", close: "23:00" }],
    });
    expect(parseOpeningHours("Sa-Th 16:00-24:00")).toEqual({ hours: [{ days: [0, 1, 2, 3, 4, 6], open: "16:00", close: "00:00" }] });
    expect(parseOpeningHours("Mo-Fr 09:00-17:00; PH off")).toEqual({});
  });

  it("maps elements and adds them once, as drafts", async () => {
    const a = runNum;
    const elements = [
      { type: "node", id: a, lat: 24.63, lon: 46.71, tags: { tourism: "museum", name: "متحف تجريبي", "name:en": `Test Museum ${run}`, opening_hours: "24/7", wheelchair: "yes" } },
      { type: "way", id: a + 1, center: { lat: 24.7, lon: 46.68 }, tags: { amenity: "restaurant", name: `Najd Kitchen ${run}`, cuisine: "arab;seafood" } },
      { type: "node", id: a + 2, lat: 24.7, lon: 46.7, tags: { amenity: "bench" } },
      { type: "node", id: a + 3, lat: 24.7, lon: 46.7, tags: { tourism: "museum" } }, // no name
    ];
    let body = "";
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ elements }), { status: 200 });
    }) as unknown as typeof fetch;
    const items = await fetchOsmPlaces("RUH", fakeFetch);
    expect(decodeURIComponent(body)).toContain("around:20000,24.7136,46.6753");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ category: "museum", nameAr: "متحف تجريبي", open24h: true, tags: ["wheelchair"], sourceRef: `node/${a}`, source: "osm" });
    expect(items[1]).toMatchObject({ category: "restaurant", nameAr: `Najd Kitchen ${run}`, cuisineEn: "Arab, Seafood", tags: ["seafood"] });

    expect(await addImportedPlaces("RUH", items)).toEqual({ added: 2, skipped: 0 });
    expect(await addImportedPlaces("RUH", items)).toEqual({ added: 0, skipped: 2 });
    const drafts = await adminListPlaces({ city: "RUH", status: "draft", q: run });
    expect(drafts).toHaveLength(2);
    // Drafts are not visible to travellers until published.
    const pub = await publishedPlaces("RUH");
    expect(pub.some((p) => p.nameEn.includes(run))).toBe(false);
    await updatePlace(drafts[0].id, { status: "published", descriptionAr: "وصف", descriptionEn: "Description" });
    expect((await publishedPlaces("RUH")).filter((p) => p.nameEn.includes(run))).toHaveLength(1);
    expect(mapOsmElement({ type: "node", id: 1, tags: { tourism: "museum", name: "x" } }, "RUH", "")).toBeNull();
  });

  it("reports an unavailable source", async () => {
    const fakeFetch = (async () => new Response("busy", { status: 429 })) as unknown as typeof fetch;
    await expect(fetchOsmPlaces("RUH", fakeFetch)).rejects.toThrow("overpass 429");
  });
});

describe("official source connector", () => {
  it("is not configured without settings", async () => {
    await expect(fetchOfficialPlaces("RUH")).rejects.toBeInstanceOf(OfficialGuideError);
  });

  it("maps the official feed", async () => {
    process.env.OFFICIAL_GUIDE_URL = "https://official.example/api/";
    process.env.OFFICIAL_GUIDE_TOKEN = "tok";
    let seen: { url: string; auth: string | null } | null = null;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: new Headers(init?.headers).get("authorization") };
      return new Response(JSON.stringify({ places: [
        { id: 77, category: "heritage", nameAr: "موقع", nameEn: "Site", lat: 24.7, lng: 46.6, openingHours: "Mo-Su 08:00-18:00", website: "http://insecure" },
        { id: 78, nameEn: "No coordinates" },
      ] }), { status: 200 });
    }) as unknown as typeof fetch;
    const items = await fetchOfficialPlaces("JED", fakeFetch);
    expect(seen).toEqual({ url: "https://official.example/api/places?city=JED", auth: "Bearer tok" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: "official", sourceRef: "77", category: "heritage", city: "JED", status: "draft", hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "08:00", close: "18:00" }] });
    expect(items[0].website).toBeUndefined();
  });
});

describe("favourites", () => {
  it("keeps only published places, without duplicates", async () => {
    const userId = `fav-${run}`;
    const draft = await createPlace({ city: "JED", category: "cafe", nameAr: "مقهى", nameEn: `Cafe ${run}`, lat: 21.5, lng: 39.2 });
    const seeded = (await publishedPlaces("RUH"))[0];
    expect(await getPlace(seeded.id)).not.toBeNull();
    expect(await changeFavorites(userId, [seeded.id, draft.id, "missing"], [])).toEqual([seeded.id]);
    expect(await changeFavorites(userId, [seeded.id], [])).toEqual([seeded.id]);
    expect((await publishedPlacesByIds([seeded.id, draft.id])).map((p) => p.id)).toEqual([seeded.id]);
    expect(await changeFavorites(userId, [], [seeded.id])).toEqual([]);
  });
});
