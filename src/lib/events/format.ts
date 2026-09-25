/** Saudi-time date helpers shared by the events pages (no server-only imports). */
const KSA_OFFSET_MS = 3 * 3_600_000;

/** Calendar day in Saudi Arabia (YYYY-MM-DD) of an instant. */
export const ksaDay = (iso: string | Date) => new Date(new Date(iso).getTime() + KSA_OFFSET_MS).toISOString().slice(0, 10);

export const addDaysISO = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Day of week (0 = Sunday) of a YYYY-MM-DD day. */
export const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

const loc = (locale: string) => (locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

export function fmtKsa(iso: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString(loc(locale), { timeZone: "Asia/Riyadh", ...opts });
}

export const fmtDay = (day: string, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(loc(locale), { timeZone: "UTC", ...opts });

/** Thursday–Saturday of the current week (the Saudi weekend, with Thursday evening). */
export function weekendRange(today: string): [string, string] {
  const wd = weekdayOf(today);
  const toThu = (4 - wd + 7) % 7;
  const start = wd === 5 || wd === 6 ? today : addDaysISO(today, toThu);
  const end = addDaysISO(start, 6 - weekdayOf(start));
  return [start, end];
}
