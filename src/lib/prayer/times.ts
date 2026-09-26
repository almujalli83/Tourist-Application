/**
 * Prayer times by calculation (Umm al-Qura method, used in Saudi Arabia): Fajr at 18.5° below
 * the horizon, Asr at shadow factor 1, Isha 90 minutes after Maghrib (120 in Ramadan).
 * Times are Saudi local time (UTC+3) and accurate to a few minutes; for exact times travellers
 * should follow the local mosque announcement.
 */
export const PRAYERS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerName = (typeof PRAYERS)[number];
export type PrayerTimes = Record<PrayerName, string>;

const TZ = 3;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const fix = (a: number, b: number) => ((a % b) + b) % b;

function julian(y: number, m: number, d: number): number {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
}

function sun(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.02 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const ra = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
  return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - ra };
}

/** Is this date (YYYY-MM-DD) in Ramadan (Umm al-Qura calendar)? */
export function isRamadan(date: string): boolean {
  try {
    const month = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    return Number.parseInt(month, 10) === 9;
  } catch {
    return false;
  }
}

const hhmm = (h: number) => {
  const mins = Math.round(fix(h, 24) * 60) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
};

/** Prayer times for a date (YYYY-MM-DD) at a location, as "HH:MM" Saudi time. */
export function prayerTimes(date: string, lat: number, lng: number): PrayerTimes {
  const [y, m, d] = date.split("-").map(Number);
  const jd = julian(y, m, d) - lng / (15 * 24);
  const noon = (t: number) => fix(12 - sun(jd + t).eqt, 24);
  const angleTime = (angle: number, t: number, before: boolean) => {
    const { decl } = sun(jd + t);
    const cos = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    const T = deg(Math.acos(Math.max(-1, Math.min(1, cos)))) / 15;
    return noon(t) + (before ? -T : T);
  };
  const asrAngle = (t: number) => {
    const { decl } = sun(jd + t);
    return -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - decl))))));
  };
  const adj = TZ - lng / 15;
  const maghrib = angleTime(0.833, 18 / 24, false) + adj;
  return {
    fajr: hhmm(angleTime(18.5, 5 / 24, true) + adj),
    sunrise: hhmm(angleTime(0.833, 6 / 24, true) + adj),
    dhuhr: hhmm(noon(12 / 24) + adj),
    asr: hhmm(angleTime(asrAngle(13 / 24), 13 / 24, false) + adj),
    maghrib: hhmm(maghrib),
    isha: hhmm(maghrib + (isRamadan(date) ? 2 : 1.5)),
  };
}
