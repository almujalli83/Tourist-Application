/** Date helpers working on plain `YYYY-MM-DD` strings (timezone-free). */

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = parseISODate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

/** Full years between birth date and reference date. */
export function ageOn(birthDate: string, on: string): number {
  const b = parseISODate(birthDate);
  const r = parseISODate(on);
  let age = r.getUTCFullYear() - b.getUTCFullYear();
  const m = r.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && r.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addMonths(s: string, months: number): string {
  const d = parseISODate(s);
  d.setUTCMonth(d.getUTCMonth() + months);
  return toISODate(d);
}
