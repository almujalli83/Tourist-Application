/**
 * The yearly pause of Umrah permits for tourist visas around Hajj. The dates are announced each
 * year, so the back office sets them (never hard-coded); trips overlapping them get a warning.
 */
import { store } from "../store";

const ID = "umrahSeason";

export interface UmrahSeason {
  /** First and last day (inclusive) when Umrah permits are paused; null = not announced. */
  pauseFrom: string | null;
  pauseTo: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getUmrahSeason(): Promise<UmrahSeason> {
  const d = await store().get<UmrahSeason & { id: string }>("config", ID);
  return { pauseFrom: d?.pauseFrom ?? null, pauseTo: d?.pauseTo ?? null, updatedAt: d?.updatedAt ?? null, updatedBy: d?.updatedBy ?? null };
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export async function setUmrahSeason(input: { pauseFrom?: unknown; pauseTo?: unknown }, by: string, now = new Date()): Promise<UmrahSeason> {
  const clear = !input.pauseFrom && !input.pauseTo;
  if (!clear && (!isDate(input.pauseFrom) || !isDate(input.pauseTo) || input.pauseTo < input.pauseFrom)) throw new Error("invalidDates");
  const doc = { id: ID, pauseFrom: clear ? null : (input.pauseFrom as string), pauseTo: clear ? null : (input.pauseTo as string), updatedAt: now.toISOString(), updatedBy: by };
  await store().put("config", ID, doc);
  return getUmrahSeason();
}

/** The pause days overlapping [from, to], or null. */
export function pauseOverlap(season: UmrahSeason, from: string, to: string): { from: string; to: string } | null {
  if (!season.pauseFrom || !season.pauseTo) return null;
  if (to < season.pauseFrom || from > season.pauseTo) return null;
  return { from: from > season.pauseFrom ? from : season.pauseFrom, to: to < season.pauseTo ? to : season.pauseTo };
}
