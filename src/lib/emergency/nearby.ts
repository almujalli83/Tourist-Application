/**
 * Hospitals (with an emergency department when known), pharmacies and police stations near a
 * point, from OpenStreetMap (Overpass; cached per area for 6 hours; off with
 * EMERGENCY_OSM=off). Data © OpenStreetMap contributors (ODbL).
 */
import { distanceKm } from "../guide/geo";

export type NearbyKind = "hospital" | "pharmacy" | "police" | "atm" | "exchange";

export interface NearbyPlace {
  id: string;
  kind: NearbyKind;
  nameAr: string | null;
  nameEn: string | null;
  lat: number;
  lng: number;
  km: number;
  /** Hospitals: has an emergency department. */
  emergency?: boolean;
  phone?: string;
  /** Pharmacies open around the clock. */
  open24h?: boolean;
  /** ATMs and exchange offices: the bank or company. */
  operator?: string;
}

const RADIUS: Record<NearbyKind, number> = { hospital: 15_000, pharmacy: 4_000, police: 15_000, atm: 3_000, exchange: 10_000 };
const FILTER: Record<NearbyKind, string> = {
  hospital: `nwr["amenity"="hospital"]`,
  pharmacy: `nwr["amenity"="pharmacy"]`,
  police: `nwr["amenity"="police"]`,
  atm: `nwr["amenity"="atm"]`,
  exchange: `nwr["amenity"="bureau_de_change"]`,
};
const CACHE_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; rows: NearbyPlace[] }>();

async function overpass(kind: NearbyKind, lat: number, lng: number): Promise<NearbyPlace[]> {
  const query = `[out:json][timeout:15];${FILTER[kind]}(around:${RADIUS[kind]},${lat},${lng});out center tags 120;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter", {
      method: "POST", body: new URLSearchParams({ data: query }), signal: ctrl.signal, headers: { "user-agent": "SaudiTrip/1.0 (emergency)" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
    return (data.elements ?? []).flatMap((e) => {
      const p = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
      if (!p) return [];
      const t = e.tags ?? {};
      const arabic = /[؀-ۿ]/;
      const nameAr = t["name:ar"] || (t.name && arabic.test(t.name) ? t.name : null) || null;
      const nameEn = t["name:en"] || (t.name && !arabic.test(t.name) ? t.name : null) || null;
      const phone = (t.phone || t["contact:phone"] || "").split(";")[0].trim() || undefined;
      return [{
        id: `osm:${e.type}/${e.id}`, kind, nameAr, nameEn, lat: p.lat, lng: p.lon,
        km: Math.round(distanceKm({ lat, lng }, { lat: p.lat, lng: p.lon }) * 100) / 100,
        ...(kind === "hospital" ? { emergency: t.emergency === "yes" } : {}),
        ...(phone ? { phone } : {}),
        ...(t.opening_hours === "24/7" ? { open24h: true } : {}),
        ...(t.operator || t.brand ? { operator: (t.operator || t.brand).slice(0, 80) } : {}),
      }];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** The nearest places of a kind, nearest first (hospitals with an emergency department first). */
export async function nearbyPlaces(kind: NearbyKind, lat: number, lng: number, limit = 8): Promise<NearbyPlace[]> {
  if (process.env.EMERGENCY_OSM === "off") return [];
  const key = `${kind}:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  let rows = hit && Date.now() - hit.at < CACHE_MS ? hit.rows : null;
  if (!rows) {
    rows = await overpass(kind, lat, lng);
    if (rows.length) cache.set(key, { at: Date.now(), rows });
  }
  // Recompute distances from this exact point (the cache is per area).
  const here = rows.map((r) => ({ ...r, km: Math.round(distanceKm({ lat, lng }, r) * 100) / 100 }));
  return here
    .filter((r) => kind !== "hospital" || r.nameAr || r.nameEn)
    .sort((a, b) => (kind === "hospital" ? Number(!!b.emergency) - Number(!!a.emergency) || a.km - b.km : a.km - b.km))
    .slice(0, limit);
}

/** Street address of a point (OpenStreetMap Nominatim), or null. */
export async function reverseAddress(lat: number, lng: number, locale: "ar" | "en"): Promise<string | null> {
  if (process.env.EMERGENCY_OSM === "off") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const url = `${process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org"}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=${locale}`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "SaudiTrip/1.0 (emergency)" } });
    if (!res.ok) return null;
    const d = (await res.json()) as { display_name?: string };
    return d.display_name?.slice(0, 300) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
