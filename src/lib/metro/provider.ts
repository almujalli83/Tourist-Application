/**
 * Riyadh Metro stations from the Royal Commission for Riyadh City open-data portal (free, no key).
 * Default source: the "Metro stations in Riyadh by metro line and station type" dataset, GeoJSON
 * export; METRO_STATIONS_URL overrides it (any GeoJSON or JSON records with names, line and
 * location). The network is kept in the store and refreshed weekly; the operations team can
 * refresh it by hand. When the portal cannot be reached and nothing is kept yet, the sandbox
 * shows sample stations (marked as such); off with DEMO_METRO=off.
 */
import { mtConfig } from "../config";
import { store } from "../store";
import { METRO_LINE_IDS, type MetroLineId, type MetroNetwork, type MetroStation } from "./types";

export const DEFAULT_METRO_URL =
  "https://opendata.rcrc.gov.sa/api/explore/v2.1/catalog/datasets/metro-stations-in-riyadh-by-metro-line-and-station-type-2024/exports/geojson";
const REFRESH_MS = 7 * 86_400_000;
const DOC = "metroNetwork";

type Kept = MetroNetwork & { id: string; url: string };

const COLOURS: [RegExp, MetroLineId][] = [
  [/blue|أزرق|ازرق/i, 1], [/red|أحمر|احمر/i, 2], [/orange|برتقالي/i, 3], [/yellow|أصفر|اصفر/i, 4], [/green|أخضر|اخضر/i, 5], [/purple|violet|بنفسجي/i, 6],
];
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

/** The line numbers named in a value: "1", "Line 3", "Blue line", "الخط الأزرق", "1, 4". */
export function linesOf(v: unknown): MetroLineId[] {
  const s = Array.isArray(v) ? v.join(",") : String(v ?? "");
  const out = new Set<MetroLineId>();
  for (const [re, id] of COLOURS) if (re.test(s)) out.add(id);
  for (const m of s.match(/\d+/g) ?? []) {
    const n = Number(m);
    if ((METRO_LINE_IDS as readonly number[]).includes(n)) out.add(n as MetroLineId);
  }
  return [...out].sort();
}

function coordsOf(rec: Record<string, unknown>, geometry?: unknown): { lat: number; lng: number } | null {
  const g = geometry as { type?: string; coordinates?: unknown } | undefined;
  if (g?.type === "Point" && Array.isArray(g.coordinates)) return { lng: Number(g.coordinates[0]), lat: Number(g.coordinates[1]) };
  for (const [k, v] of Object.entries(rec)) {
    if (!/geo|point|location|coord/i.test(k) || !v) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if (o.lat !== undefined && (o.lon !== undefined || o.lng !== undefined)) return { lat: Number(o.lat), lng: Number(o.lon ?? o.lng) };
    }
    if (typeof v === "string" && /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v.trim())) {
      const [lat, lng] = v.split(",").map(Number);
      return { lat, lng };
    }
  }
  const lat = Number(rec.latitude ?? rec.lat);
  const lng = Number(rec.longitude ?? rec.lng ?? rec.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && (rec.latitude ?? rec.lat) !== undefined ? { lat, lng } : null;
}

/** Stations from a GeoJSON export or JSON records; one station per place, with all its lines. */
export function parseStations(data: unknown): MetroStation[] {
  const d = data as { features?: unknown[]; results?: unknown[] } | unknown[];
  const rows: { props: Record<string, unknown>; geometry?: unknown }[] = Array.isArray(d)
    ? d.map((r) => ({ props: (r ?? {}) as Record<string, unknown> }))
    : Array.isArray(d?.features)
      ? d.features.map((f) => ({ props: ((f as { properties?: unknown }).properties ?? {}) as Record<string, unknown>, geometry: (f as { geometry?: unknown }).geometry }))
      : Array.isArray(d?.results)
        ? d.results.map((r) => ({ props: (r ?? {}) as Record<string, unknown> }))
        : [];
  const out: MetroStation[] = [];
  for (const { props, geometry } of rows) {
    const c = coordsOf(props, geometry);
    // Riyadh only: a wrong axis order or a stray record is dropped.
    if (!c || !(c.lat > 24 && c.lat < 25.5 && c.lng > 46 && c.lng < 47.5)) continue;
    const names = Object.entries(props).filter(([k, v]) => /name|station|اسم|محط/i.test(k) && !/type|line|خط|مسار|id$|code|no$/i.test(k) && typeof v === "string" && v.trim());
    const nameAr = (names.find(([, v]) => hasArabic(v as string))?.[1] as string | undefined)?.trim();
    const nameEn = (names.find(([, v]) => !hasArabic(v as string))?.[1] as string | undefined)?.trim();
    if (!nameAr && !nameEn) continue;
    const lines = linesOf(Object.entries(props).filter(([k]) => /line|خط|مسار/i.test(k)).map(([, v]) => v));
    if (!lines.length) continue;
    const lat = Math.round(c.lat * 1e5) / 1e5;
    const lng = Math.round(c.lng * 1e5) / 1e5;
    // Interchanges appear once per line: merged when the name matches, or the platforms are within 250 m.
    const same = out.find((s) => (nameEn && s.nameEn === nameEn) || (nameAr && s.nameAr === nameAr) || (Math.abs(s.lat - lat) < 0.0023 && Math.abs(s.lng - lng) < 0.0025));
    if (same) {
      same.lines = [...new Set([...same.lines, ...lines])].sort();
      same.nameAr ||= nameAr ?? "";
      same.nameEn ||= nameEn ?? "";
      continue;
    }
    out.push({ id: `st-${out.length + 1}`, nameAr: nameAr ?? nameEn!, nameEn: nameEn ?? nameAr!, lat, lng, lines });
  }
  return out;
}

const metroUrl = () => process.env.METRO_STATIONS_URL?.trim() || DEFAULT_METRO_URL;

/** Fetches the stations from the open-data link and keeps them. */
export async function syncMetro(now = new Date()): Promise<MetroNetwork> {
  const url = metroUrl();
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`metro source ${res.status}`);
  const stations = parseStations(await res.json());
  if (stations.length < 5) throw new Error("metro source returned no stations");
  const kept: Kept = { id: DOC, url, stations, source: "rcrc", fetchedAt: now.toISOString() };
  await store().put("config", DOC, kept);
  return { stations, source: "rcrc", fetchedAt: kept.fetchedAt };
}

/** Sample stations (approximate locations) for the sandbox, until the open data is reachable. */
export const SAMPLE_STATIONS: MetroStation[] = [
  { id: "sx-kafd", nameAr: "المركز المالي", nameEn: "KAFD", lat: 24.7672, lng: 46.6431, lines: [1, 4, 6] },
  { id: "sx-stc", nameAr: "إس تي سي", nameEn: "STC", lat: 24.7266, lng: 46.6635, lines: [1, 2] },
  { id: "sx-olaya", nameAr: "العليا", nameEn: "Olaya", lat: 24.6952, lng: 46.6843, lines: [1] },
  { id: "sx-museum", nameAr: "المتحف الوطني", nameEn: "National Museum", lat: 24.6475, lng: 46.7109, lines: [1, 5] },
  { id: "sx-hokm", nameAr: "قصر الحكم", nameEn: "Qasr Al Hokm", lat: 24.6307, lng: 46.7131, lines: [1, 3] },
  { id: "sx-ksu", nameAr: "جامعة الملك سعود", nameEn: "King Saud University", lat: 24.7163, lng: 46.6196, lines: [2] },
  { id: "sx-stadium", nameAr: "استاد الملك فهد", nameEn: "King Fahd Stadium", lat: 24.7893, lng: 46.8389, lines: [2] },
  { id: "sx-airport", nameAr: "مطار الملك خالد (الصالات 1-2)", nameEn: "KKIA Terminals 1-2", lat: 24.9606, lng: 46.7021, lines: [4] },
];

let memo: { at: number; net: MetroNetwork } | null = null;

/** The network: the kept copy (refreshed weekly in the background), else fetched now, else the sample. */
export async function getMetro(now = new Date()): Promise<MetroNetwork> {
  if (memo && now.getTime() - memo.at < 10 * 60_000) return memo.net;
  const kept = await store().get<Kept>("config", DOC);
  let net: MetroNetwork | null = kept && kept.url === metroUrl() ? { stations: kept.stations, source: kept.source, fetchedAt: kept.fetchedAt } : null;
  if (!net || now.getTime() - Date.parse(net.fetchedAt ?? "") > REFRESH_MS) {
    try {
      net = await syncMetro(now);
    } catch {
      /* unreachable: keep what we have, retried on the next request after 10 minutes */
    }
  }
  if (!net) net = mtConfig().mock && process.env.DEMO_METRO !== "off" ? { stations: SAMPLE_STATIONS, source: "sample", fetchedAt: null } : { stations: [], source: "rcrc", fetchedAt: null };
  memo = { at: now.getTime(), net };
  return net;
}

export function resetMetroCache() {
  memo = null;
}
