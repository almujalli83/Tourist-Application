/**
 * Calendar export of a plan (iCalendar, one event per scheduled activity, Saudi time). Runs in the
 * browser; the file is added to the phone's or computer's calendar.
 */
import { fmtMin, type ScheduledEntry } from "./schedule";
import type { TripPlan } from "./types";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const stamp = (date: string, minutes: number) => {
  const day = new Date(Date.parse(`${date}T00:00:00Z`) + Math.floor(minutes / 1440) * 86_400_000).toISOString().slice(0, 10);
  return `${day.replace(/-/g, "")}T${fmtMin(minutes).replace(":", "")}00`;
};
/** Long lines are folded at 73 characters as the format requires. */
const fold = (line: string) => line.match(/.{1,73}/gu)?.join("\r\n ") ?? line;

export function planToIcs(plan: Pick<TripPlan, "days" | "locale">, schedules: ScheduledEntry[][], origin: string): string {
  const ar = plan.locale === "ar";
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Saudi Trip//Trip planner//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:Asia/Riyadh", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0300", "TZOFFSETTO:+0300", "TZNAME:+03", "END:STANDARD", "END:VTIMEZONE",
  ];
  plan.days.forEach((day, i) => {
    for (const e of schedules[i] ?? []) {
      if (e.kind !== "item" || !e.item) continue;
      const it = e.item;
      const title = ar ? it.titleAr : it.titleEn;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${it.id}-${day.date}@saudi-trip`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=Asia/Riyadh:${stamp(day.date, e.start)}`,
        `DTEND;TZID=Asia/Riyadh:${stamp(day.date, Math.max(e.end, e.start + 15))}`,
        `SUMMARY:${esc(title)}`,
        `GEO:${it.lat};${it.lng}`,
        `LOCATION:${esc(title)}`,
        `DESCRIPTION:${esc([it.note, it.bookHref ? `${origin}/${plan.locale}${it.bookHref}` : "", `https://www.google.com/maps/dir/?api=1&destination=${it.lat},${it.lng}`].filter(Boolean).join("\n"))}`,
        "END:VEVENT",
      );
    }
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
