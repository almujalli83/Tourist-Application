/**
 * OpenStreetMap import (Overpass API): named attractions, museums, parks, malls, restaurants and
 * cafés around a city centre. Results are drafts: the operations team reviews, completes the
 * Arabic/English texts and publishes. Data © OpenStreetMap contributors (ODbL).
 */
import { CITY_CENTERS } from "./centers";
import type { OpeningSlot, Place, PlaceCategory } from "./types";

const OVERPASS_URL = () => process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const RADIUS_M = 20_000;
const MAX_ITEMS = 200;

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function overpassQuery(lat: number, lng: number, radius = RADIUS_M): string {
  const a = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:60];(
nwr["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo)$"]["name"]${a};
nwr["historic"~"^(castle|fort|monument|archaeological_site|ruins|palace)$"]["name"]${a};
nwr["leisure"~"^(park|water_park|beach_resort)$"]["name"]${a};
nwr["natural"="beach"]["name"]${a};
nwr["shop"="mall"]["name"]${a};
nwr["amenity"~"^(restaurant|cafe)$"]["name"]["cuisine"]${a};
);out center tags ${MAX_ITEMS * 3};`;
}

function categoryOf(t: Record<string, string>): PlaceCategory | null {
  if (t.tourism === "museum" || t.tourism === "gallery") return "museum";
  if (t.historic) return "heritage";
  if (t.tourism === "theme_park" || t.tourism === "zoo" || t.leisure === "water_park") return "entertainment";
  if (t.natural === "beach" || t.leisure === "beach_resort") return "beach";
  if (t.leisure === "park") return "park";
  if (t.shop === "mall") return "shopping";
  if (t.amenity === "restaurant") return "restaurant";
  if (t.amenity === "cafe") return "cafe";
  if (t.tourism === "viewpoint") return "nature";
  if (t.tourism === "attraction") return "landmark";
  return null;
}

const DAY_CODES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Parses the common forms of OSM opening_hours ("24/7", "Mo-Fr 09:00-22:00; Sa,Su 10:00-23:00"). */
export function parseOpeningHours(v: string | undefined): { open24h?: true; hours?: OpeningSlot[] } {
  if (!v) return {};
  const s = v.trim();
  if (s === "24/7") return { open24h: true };
  const slots: OpeningSlot[] = [];
  for (const rule of s.split(";").map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?,?)+)?\s*((?:\d{2}:\d{2}-\d{2}:\d{2},?\s*)+)$/);
    if (!m) return {}; // anything unusual (holidays, "off", months): leave hours unknown
    const days = new Set<number>();
    for (const part of (m[1] ?? "Mo-Su").split(",").filter(Boolean)) {
      const [from, to] = part.split("-").map((d) => DAY_CODES.indexOf(d));
      if (from < 0 || (to !== undefined && to < 0)) return {};
      if (to === undefined) days.add(from);
      else for (let d = from; ; d = (d + 1) % 7) { days.add(d); if (d === to) break; }
    }
    for (const range of m[2].split(",").map((r) => r.trim()).filter(Boolean)) {
      const [open, closeRaw] = range.split("-");
      const close = closeRaw === "24:00" ? "00:00" : closeRaw;
      if (Number(open.slice(0, 2)) > 23 || Number(close.slice(0, 2)) > 23) return {};
      slots.push({ days: [...days].sort(), open, close });
    }
  }
  return slots.length ? { hours: slots } : {};
}

const cap = (s: string) => s.replace(/_/g, " ").replace(/;/g, ", ").replace(/\b\w/g, (c) => c.toUpperCase());

export function mapOsmElement(el: OsmElement, city: string, now: string): Place | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const category = categoryOf(t);
  if (lat == null || lng == null || !category) return null;
  const nameAr = t["name:ar"] || (/[؀-ۿ]/.test(t.name ?? "") ? t.name : "");
  const nameEn = t["name:en"] || (!/[؀-ۿ]/.test(t.name ?? "") ? t.name : "");
  if (!nameAr && !nameEn) return null;
  const website = t.website || t["contact:website"];
  const p: Place = {
    id: "", city, category,
    nameAr: nameAr || nameEn!, nameEn: nameEn || nameAr!,
    descriptionAr: "", descriptionEn: "",
    lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6,
    tags: [], source: "osm", sourceRef: `${el.type}/${el.id}`, status: "draft", updatedAt: now,
    ...parseOpeningHours(t.opening_hours),
  };
  if (t.cuisine) p.cuisineEn = cap(t.cuisine);
  if (t.wheelchair === "yes") p.tags.push("wheelchair");
  if (t.fee === "no") p.tags.push("free");
  if (t["diet:vegetarian"] === "yes" || t["diet:vegetarian"] === "only") p.tags.push("vegetarian");
  if (t.cuisine?.includes("seafood")) p.tags.push("seafood");
  const phone = t.phone || t["contact:phone"];
  if (phone) p.phone = phone.slice(0, 30);
  if (website && /^https:\/\//i.test(website)) p.website = website.slice(0, 300);
  const addr = [t["addr:street"], t["addr:district"] ?? t["addr:suburb"]].filter(Boolean).join("، ");
  if (addr) {
    if (/[\u0600-\u06FF]/.test(addr)) p.addressAr = addr;
    else p.addressEn = addr;
  }
  return p;
}

/** Fetches candidate places around a city from Overpass (not saved). */
export async function fetchOsmPlaces(city: string, fetchImpl: typeof fetch = fetch): Promise<Place[]> {
  const c = CITY_CENTERS[city];
  if (!c) throw new Error("invalidCity");
  const res = await fetchImpl(OVERPASS_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "SaudiTrip/1.0 (guide import)" },
    body: new URLSearchParams({ data: overpassQuery(c.lat, c.lng) }).toString(),
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const data = (await res.json()) as { elements?: OsmElement[] };
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const el of data.elements ?? []) {
    const p = mapOsmElement(el, city, now);
    if (!p) continue;
    const key = `${p.category}:${p.nameEn.toLowerCase()}`;
    if (seen.has(key)) continue; // same named place mapped as several objects
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
