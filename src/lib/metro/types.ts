/**
 * Riyadh Metro (client-safe): lines, stations and the metro option between two places.
 * Stations come from the Royal Commission for Riyadh City open data (see provider.ts).
 * No timetables or fares here: the ride time is an estimate from the distance.
 */
import { distanceKm } from "../guide/geo";

export const METRO_LINE_IDS = [1, 2, 3, 4, 5, 6] as const;
export type MetroLineId = (typeof METRO_LINE_IDS)[number];

export interface MetroLine { id: MetroLineId; color: string; nameAr: string; nameEn: string }

/** The six lines and their official colours. */
export const METRO_LINES: Record<MetroLineId, MetroLine> = {
  1: { id: 1, color: "#0072BC", nameAr: "الخط الأزرق", nameEn: "Blue Line" },
  2: { id: 2, color: "#E2231A", nameAr: "الخط الأحمر", nameEn: "Red Line" },
  3: { id: 3, color: "#F7941D", nameAr: "الخط البرتقالي", nameEn: "Orange Line" },
  4: { id: 4, color: "#FFD200", nameAr: "الخط الأصفر", nameEn: "Yellow Line" },
  5: { id: 5, color: "#00A651", nameAr: "الخط الأخضر", nameEn: "Green Line" },
  6: { id: 6, color: "#8E3A96", nameAr: "الخط البنفسجي", nameEn: "Purple Line" },
};

export interface MetroStation { id: string; nameAr: string; nameEn: string; lat: number; lng: number; lines: MetroLineId[] }

export interface MetroNetwork {
  stations: MetroStation[];
  /** Where the data came from: the open-data link, or sample data (sandbox, when unreachable). */
  source: "rcrc" | "sample";
  fetchedAt: string | null;
}

/** Walking to or from a station is suggested up to this distance (km, straight line). */
export const STATION_WALK_KM = 1;
/** Below this distance the metro is not worth it (walk or a short ride instead). */
export const METRO_MIN_KM = 3;
const ROAD = 1.3;
const walkMins = (km: number) => Math.max(1, Math.round((km * ROAD * 1000) / 80));

export function nearestStation(stations: MetroStation[], p: { lat: number; lng: number }): { station: MetroStation; km: number; walkMins: number } | null {
  let best: MetroStation | null = null;
  let bestKm = Infinity;
  for (const s of stations) {
    const km = distanceKm(p, s);
    if (km < bestKm) [best, bestKm] = [s, km];
  }
  return best ? { station: best, km: Math.round(bestKm * 100) / 100, walkMins: walkMins(bestKm) } : null;
}

export interface MetroLeg {
  from: MetroStation;
  to: MetroStation;
  line: MetroLineId;
  walkToMins: number;
  walkFromMins: number;
  /** Door to door, estimated: walking, waiting and riding (~35 km/h with stops). */
  mins: number;
}

/**
 * The metro between two places, when both are a short walk from stations on the same line.
 * Changes between lines are left out (they need the official journey planner).
 */
export function metroLeg(stations: MetroStation[], a: { lat: number; lng: number }, b: { lat: number; lng: number }): MetroLeg | null {
  if (!stations.length || distanceKm(a, b) < METRO_MIN_KM) return null;
  const near = (p: { lat: number; lng: number }) => stations.map((s) => ({ s, km: distanceKm(p, s) })).filter((x) => x.km <= STATION_WALK_KM);
  let best: MetroLeg | null = null;
  for (const x of near(a)) {
    for (const y of near(b)) {
      if (x.s.id === y.s.id) continue;
      const line = x.s.lines.find((l) => y.s.lines.includes(l));
      if (!line) continue;
      const ride = Math.round(4 + (distanceKm(x.s, y.s) * ROAD * 60) / 35);
      const leg: MetroLeg = { from: x.s, to: y.s, line, walkToMins: walkMins(x.km), walkFromMins: walkMins(y.km), mins: walkMins(x.km) + ride + walkMins(y.km) };
      if (!best || leg.mins < best.mins) best = leg;
    }
  }
  return best;
}
