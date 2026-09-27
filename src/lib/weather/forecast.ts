/**
 * Weather forecasts from Open-Meteo (free, no key): daily temperature, rain, wind gusts, and dust
 * from its air-quality model. Cached per city for 3 hours; WEATHER=off disables it.
 */
export interface DayWeather {
  date: string;
  tMax: number;
  tMin: number;
  /** mm */
  rain: number;
  rainChance: number;
  /** km/h */
  gusts: number;
  /** Peak dust, µg/m³ (null when unknown). */
  dust: number | null;
  code: number;
}

export type HazardKind = "heat" | "rain" | "wind" | "dust";
export interface Hazard {
  kind: HazardKind;
  severity: "warning" | "danger";
  value: number;
}

/** Thresholds (Saudi summer conditions): heat ≥ 43°C (≥ 47 danger), rain ≥ 5 mm (≥ 20), gusts ≥ 50 km/h (≥ 70), dust ≥ 300 µg/m³ (≥ 800). */
export function hazardsOf(d: DayWeather): Hazard[] {
  const out: Hazard[] = [];
  if (d.tMax >= 43) out.push({ kind: "heat", severity: d.tMax >= 47 ? "danger" : "warning", value: d.tMax });
  if (d.rain >= 5) out.push({ kind: "rain", severity: d.rain >= 20 ? "danger" : "warning", value: d.rain });
  if (d.gusts >= 50) out.push({ kind: "wind", severity: d.gusts >= 70 ? "danger" : "warning", value: d.gusts });
  if (d.dust !== null && d.dust >= 300) out.push({ kind: "dust", severity: d.dust >= 800 ? "danger" : "warning", value: d.dust });
  return out;
}

const CACHE_MS = 3 * 3600_000;
const cache = new Map<string, { at: number; days: DayWeather[] }>();

async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 7-day forecast for a point (Saudi time), or null when unavailable. */
export async function forecast(lat: number, lng: number): Promise<DayWeather[] | null> {
  if (process.env.WEATHER === "off") return null;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.days;
  const base = process.env.OPEN_METEO_URL || "https://api.open-meteo.com";
  const aq = process.env.OPEN_METEO_AQ_URL || "https://air-quality-api.open-meteo.com";
  const [w, a] = await Promise.all([
    getJson(`${base}/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,weather_code&timezone=Asia%2FRiyadh&forecast_days=7`),
    getJson(`${aq}/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=dust&timezone=Asia%2FRiyadh&forecast_days=5`),
  ]);
  const d = (w as { daily?: Record<string, (number | string | null)[]> } | null)?.daily;
  if (!d?.time?.length) return null;
  const dust = new Map<string, number>();
  const h = (a as { hourly?: { time?: string[]; dust?: (number | null)[] } } | null)?.hourly;
  h?.time?.forEach((t, i) => {
    const v = h.dust?.[i];
    if (typeof v === "number") dust.set(t.slice(0, 10), Math.max(dust.get(t.slice(0, 10)) ?? 0, v));
  });
  const num = (k: string, i: number) => Number(d[k]?.[i] ?? 0) || 0;
  const days = (d.time as string[]).map((date, i) => ({
    date, tMax: Math.round(num("temperature_2m_max", i)), tMin: Math.round(num("temperature_2m_min", i)),
    rain: Math.round(num("precipitation_sum", i) * 10) / 10, rainChance: Math.round(num("precipitation_probability_max", i)),
    gusts: Math.round(num("wind_gusts_10m_max", i)), dust: dust.has(date) ? Math.round(dust.get(date)!) : null, code: num("weather_code", i),
  }));
  cache.set(key, { at: Date.now(), days });
  return days;
}

/** Test helper. */
export const clearWeatherCache = () => cache.clear();
