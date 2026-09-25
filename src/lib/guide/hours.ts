import type { OpeningSlot, Place } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Saudi local time (UTC+3): day of week and minutes since midnight. */
export function ksaClock(now = new Date()) {
  const d = new Date(now.getTime() + 3 * 3600_000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Open now? `null` when the hours are unknown. Handles slots that pass midnight. */
export function isOpenNow(p: Pick<Place, "hours" | "open24h">, now = new Date()): boolean | null {
  if (p.open24h) return true;
  if (!p.hours?.length) return null;
  const { day, minutes } = ksaClock(now);
  const yesterday = (day + 6) % 7;
  return p.hours.some((s: OpeningSlot) => {
    const o = toMin(s.open);
    const c = toMin(s.close);
    if (c > o) return s.days.includes(day) && minutes >= o && minutes < c;
    // Overnight slot: today after opening, or yesterday's slot still running.
    return (s.days.includes(day) && minutes >= o) || (s.days.includes(yesterday) && minutes < c);
  });
}

export const isValidHHMM = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
