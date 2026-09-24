/**
 * Helpers for the passport's visual (printed) zone. The MRZ does not contain the issue date,
 * so it is looked up among the dates printed on the data page.
 */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y > 50 ? 1900 : 2000;
  const s = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s ? s : null;
}

/** Finds Gregorian dates written as "19 Jan 2014", "19JAN14", "19/01/2014", "19.01.2014" or "2014-01-19". */
export function extractDates(text: string): string[] {
  const t = text.toUpperCase().replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, "0");
  const found = new Set<string>();
  for (const m of t.matchAll(/\b(\d{1,2})\s*[ /.-]?\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\s*[ /.-]?\s*(\d{4}|\d{2})\b/g)) {
    const d = iso(Number(m[3]), MONTHS[m[2]], Number(m[1]));
    if (d) found.add(d);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    const d = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    if (d) found.add(d);
  }
  for (const m of t.matchAll(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) {
    const d = iso(Number(m[1]), Number(m[2]), Number(m[3]));
    if (d) found.add(d);
  }
  return [...found];
}

/**
 * Picks the issue date: the one printed date that is after the birth date, before the expiry
 * date and within 11 years of it. Returns null when there is no single candidate.
 */
export function guessIssueDate(text: string, birthDate: string, expiryDate: string): string | null {
  if (!birthDate || !expiryDate) return null;
  const earliest = `${Number(expiryDate.slice(0, 4)) - 11}${expiryDate.slice(4)}`;
  const candidates = extractDates(text).filter((d) => d > birthDate && d < expiryDate && d >= earliest);
  return candidates.length === 1 ? candidates[0] : null;
}
