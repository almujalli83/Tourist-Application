/** Bus between two places of a day plan (client-safe): both a short walk from stops on the same line. */
import { distanceKm } from "../guide/geo";
import type { TransitLine } from "./types";

const WALK_KM = 0.8;
const MIN_KM = 2;
const walkMins = (km: number) => Math.max(1, Math.round((km * 1.3 * 60) / 4.8));

export interface BusLeg { line: TransitLine; fromStop: string; fromStopAr: string; toStop: string; toStopAr: string; mins: number }

export function busLeg(lines: TransitLine[], a: { lat: number; lng: number }, b: { lat: number; lng: number }): BusLeg | null {
  if (!lines.length || distanceKm(a, b) < MIN_KM) return null;
  let best: BusLeg | null = null;
  for (const line of lines) {
    const near = (p: { lat: number; lng: number }) => line.stops.map((s, i) => ({ s, i, km: distanceKm(p, s) })).filter((x) => x.km <= WALK_KM).sort((x, y) => x.km - y.km)[0];
    const x = near(a);
    const y = near(b);
    if (!x || !y || x.i === y.i) continue;
    let km = 0;
    for (let k = Math.min(x.i, y.i); k < Math.max(x.i, y.i); k++) km += distanceKm(line.stops[k], line.stops[k + 1]) * 1.3;
    const mins = walkMins(x.km) + 6 + Math.round((km * 60) / 20) + Math.abs(y.i - x.i) + walkMins(y.km);
    if (!best || mins < best.mins) best = { line, fromStop: x.s.nameEn, fromStopAr: x.s.nameAr, toStop: y.s.nameEn, toStopAr: y.s.nameAr, mins };
  }
  return best;
}
