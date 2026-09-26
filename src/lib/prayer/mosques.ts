/**
 * Mosques near a point: the guide's published mosques, and mosques from OpenStreetMap (Overpass,
 * cached per area for 6 hours; off with PRAYER_MOSQUES_OSM=off). Grand mosques (جامع) are marked
 * for the Friday prayer. Data © OpenStreetMap contributors (ODbL).
 */
import { distanceKm } from "../guide/geo";
import { ensureGuideSeeded } from "../guide/repo";
import type { Place } from "../guide/types";
import { store } from "../store";

export interface Mosque {
  id: string;
  nameAr: string | null;
  nameEn: string | null;
  lat: number;
  lng: number;
  km: number;
  /** Grand mosque (جامع) — holds the Friday prayer. */
  jami: boolean;
  source: "guide" | "osm";
}

const RADIUS_M = 5000;
const MAX = 12;
const CACHE_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; rows: Omit<Mosque, "km">[] }>();

const JAMI = /جامع|grand|jami|jame|friday|الجمعة/i;

async function osmMosques(lat: number, lng: number): Promise<Omit<Mosque, "km">[]> {
  if (process.env.PRAYER_MOSQUES_OSM === "off") return [];
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const query = `[out:json][timeout:15];nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${RADIUS_M},${lat},${lng});out center tags 150;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter", {
      method: "POST", body: new URLSearchParams({ data: query }), signal: ctrl.signal,
      headers: { "user-agent": "SaudiTrip/1.0 (prayer times)" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    const rows = (data.elements ?? []).flatMap((e) => {
      const p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
      if (!p) return [];
      const t = e.tags ?? {};
      const nameAr = t["name:ar"] || (/[؀-ۿ]/.test(t.name ?? "") ? t.name : null) || null;
      const nameEn = t["name:en"] || (t.name && !/[؀-ۿ]/.test(t.name) ? t.name : null) || null;
      return [{ id: `osm:${e.type}/${e.id}`, nameAr, nameEn, lat: p.lat, lng: p.lon, jami: JAMI.test(`${t.name ?? ""} ${t["name:en"] ?? ""} ${t["name:ar"] ?? ""}`) || t.mosque === "jami", source: "osm" as const }];
    });
    cache.set(key, { at: Date.now(), rows });
    return rows;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function guideMosques(): Promise<Omit<Mosque, "km">[]> {
  await ensureGuideSeeded();
  const rows = await store().findBy<Place>("places", "category", "mosque");
  return rows
    .filter((p) => p.status === "published")
    .map((p) => ({ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn, lat: p.lat, lng: p.lng, jami: JAMI.test(`${p.nameAr} ${p.nameEn}`), source: "guide" as const }));
}

/** Nearest mosques (guide first when the same mosque is in both), nearest first. */
export async function nearbyMosques(lat: number, lng: number): Promise<Mosque[]> {
  const [guide, osm] = await Promise.all([guideMosques(), osmMosques(lat, lng)]);
  const near = (m: Omit<Mosque, "km">) => ({ ...m, km: Math.round(distanceKm({ lat, lng }, m) * 100) / 100 });
  const g = guide.map(near).filter((m) => m.km <= 25);
  const o = osm.map(near).filter((m) => !g.some((x) => distanceKm(x, m) < 0.08));
  return [...g, ...o].sort((a, b) => a.km - b.km).slice(0, MAX);
}
