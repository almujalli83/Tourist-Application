/**
 * Timing of a plan day (runs in the browser and on the server): events keep their session time,
 * meals sit at lunch / dinner time, prayers (when chosen) are reserved, and the other activities
 * follow in the traveller's order in the gaps, with travel time between places and a check of
 * the opening hours.
 */
import { distanceKm } from "../guide/geo";
import { prayerTimes, type PrayerName } from "../prayer/times";
import type { DayType, Pace, PlanDay, PlanItem } from "./types";

export interface ScheduledEntry {
  kind: "item" | "prayer" | "travel" | "arrival" | "departure";
  item?: PlanItem;
  prayer?: PrayerName | "jumuah";
  start: number; // minutes since midnight
  end: number;
  /** Driving minutes from the previous place (items only). */
  travelMins?: number;
  warnings: ("closed" | "conflict" | "late")[];
}

export interface DayContext { pace: Pace; prayer: boolean; kids: boolean }

const PRAYER_MINS = 20;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtMin = (m: number) => {
  const x = Math.max(0, Math.round(m)) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** Minutes of driving between two points (city traffic ≈ 30 km/h plus parking). */
export const travelMinutes = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const km = distanceKm(a, b);
  return km < 0.3 ? 5 : Math.round(10 + km * 2);
};

export function dayWindow(type: DayType, ctx: DayContext): { start: number; end: number } {
  const base = { relaxed: 600, moderate: 540, intense: 480 }[ctx.pace];
  const end = ctx.kids ? 21 * 60 + 30 : { relaxed: 22 * 60, moderate: 23 * 60, intense: 23 * 60 + 45 }[ctx.pace];
  if (type === "arrival") return { start: 16 * 60, end };
  if (type === "transfer") return { start: 15 * 60, end };
  if (type === "departure") return { start: base, end: 12 * 60 };
  return { start: base, end };
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Earliest minute ≥ `at` when the item is open on that date (null when it doesn't open again that day). */
export function nextOpen(item: Pick<PlanItem, "hours" | "open24h">, date: string, at: number): number | null {
  if (item.open24h || !item.hours?.length) return at;
  const day = weekday(date);
  const yesterday = (day + 6) % 7;
  let best: number | null = null;
  for (const s of item.hours) {
    const o = toMin(s.open);
    let c = toMin(s.close);
    if (c <= o) {
      if (s.days.includes(yesterday) && at < c) return at; // yesterday's overnight slot still running
      c += 1440;
    }
    if (!s.days.includes(day)) continue;
    if (at >= o && at < c) return at;
    if (at < o && (best === null || o < best)) best = o;
  }
  return best;
}

const mealTime = (meal: "lunch" | "dinner", ctx: DayContext) => (meal === "lunch" ? 13 * 60 + 30 : ctx.kids ? 19 * 60 : 20 * 60 + 30);

export function scheduleDay(day: PlanDay, ctx: DayContext, cityCenter: { lat: number; lng: number }): ScheduledEntry[] {
  const win = dayWindow(day.type, ctx);
  const fixed: ScheduledEntry[] = [];
  if (ctx.prayer) {
    const p = prayerTimes(day.date, cityCenter.lat, cityCenter.lng);
    const friday = weekday(day.date) === 5;
    for (const name of ["dhuhr", "asr", "maghrib", "isha"] as const) {
      const t = toMin(p[name]);
      if (!(t >= win.start - 30 && t < win.end)) continue;
      // Friday prayer: the sermon starts before the Dhuhr time and takes about an hour in all.
      if (friday && name === "dhuhr") fixed.push({ kind: "prayer", prayer: "jumuah", start: t - 20, end: t + 40, warnings: [] });
      else fixed.push({ kind: "prayer", prayer: name, start: t, end: t + PRAYER_MINS, warnings: [] });
    }
  }
  const flexible: PlanItem[] = [];
  const meals: PlanItem[] = [];
  for (const item of day.items) {
    if (item.fixedStart) fixed.push({ kind: "item", item, start: toMin(item.fixedStart), end: toMin(item.fixedStart) + item.durationMins, warnings: [] });
    else if (item.meal) meals.push(item);
    else flexible.push(item);
  }
  // Meals go at lunch / dinner time, moved before or after an event that takes that time.
  for (const item of meals) {
    let start = Math.max(mealTime(item.meal!, ctx), win.start);
    const earliest = item.meal === "lunch" ? 12 * 60 : 18 * 60;
    const event = fixed.find((f) => f.kind === "item" && start < f.end && start + item.durationMins > f.start);
    if (event) start = event.start - item.durationMins - 15 >= Math.max(earliest, win.start) ? event.start - item.durationMins - 15 : event.end + 15;
    // Don't sit down to eat during a prayer.
    for (const f of fixed) if (f.kind === "prayer" && start < f.end && start + 15 > f.start) start = f.end;
    fixed.push({ kind: "item", item, start, end: start + item.durationMins, warnings: [] });
  }
  fixed.sort((a, b) => a.start - b.start);

  const out: ScheduledEntry[] = [];
  let cursor = win.start;
  let last: { lat: number; lng: number } | null = null;
  const placed = [...fixed];
  for (const item of flexible) {
    const travel = last ? travelMinutes(last, item) : 0;
    let start = cursor + travel;
    const warnings: ScheduledEntry["warnings"] = [];
    for (let guard = 0; guard < 12; guard++) {
      const open = nextOpen(item, day.date, start);
      if (open === null) {
        warnings.push("closed");
        break;
      }
      start = open;
      // Visits don't overlap events, meals or the Friday prayer; other prayers only pause a visit.
      const clash = placed.find((f) => (f.kind === "item" || f.prayer === "jumuah") && start < f.end && start + item.durationMins > f.start);
      if (!clash) break;
      start = clash.end + (clash.item ? travelMinutes(clash.item, item) : 5);
    }
    const end = start + item.durationMins;
    if (end > win.end + 15) warnings.push("late");
    const entry: ScheduledEntry = { kind: "item", item, start, end, travelMins: travel || undefined, warnings };
    placed.push(entry);
    cursor = end;
    last = item;
  }
  placed.sort((a, b) => a.start - b.start || (a.kind === "prayer" ? -1 : 1));
  // Fixed activities that overlap each other, and late finishes.
  let prevItem: ScheduledEntry | null = null;
  for (const e of placed) {
    if (e.kind !== "item") continue;
    if (prevItem && e.start < prevItem.end && !e.warnings.includes("conflict")) e.warnings.push("conflict");
    if (e.item?.fixedStart && e.end > win.end + 15 && !e.warnings.includes("late")) e.warnings.push("late");
    // Travel time from whatever comes before (recomputed in the final order).
    if (prevItem?.item && e.item) e.travelMins = travelMinutes(prevItem.item, e.item);
    else if (!prevItem) e.travelMins = undefined;
    prevItem = e;
  }
  if (day.type === "arrival") out.push({ kind: "arrival", start: win.start - 30, end: win.start, warnings: [] });
  if (day.type === "transfer") out.push({ kind: "travel", start: 11 * 60, end: win.start, warnings: [] });
  out.push(...placed);
  if (day.type === "departure") out.push({ kind: "departure", start: win.end, end: win.end, warnings: [] });
  return out;
}

/** Number of warnings in a day (shown on the day tab). */
export const dayWarnings = (entries: ScheduledEntry[]) => entries.reduce((n, e) => n + e.warnings.length, 0);
