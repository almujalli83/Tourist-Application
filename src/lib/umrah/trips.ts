/**
 * The traveller's Umrah trips (packages and draft plans with a Makkah stay), their Umrah day, the
 * way to Makkah (by air through Jeddah, or from Jeddah by road), the Hajj-season warning, the Nusuk
 * permits when linked, and the reminders (book the appointment in Nusuk; the Umrah day itself).
 */
import { mtConfig } from "../config";
import { UMRAH_CITY } from "../data/cities";
import { addDays } from "../dates";
import { stayDates } from "../itinerary";
import { notifyTravellers } from "../notify";
import { listPlans } from "../planner/plans";
import type { AppNotification } from "../reminders/reminders";
import { getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { nusukLinked, nusukPermits, type NusukPermit } from "./nusuk";
import { getUmrahSeason, pauseOverlap } from "./season";

export interface UmrahTrip {
  id: string;
  bookingId: string | null;
  planId: string | null;
  reference: string | null;
  departureDate: string;
  returnDate: string;
  makkahFrom: string;
  makkahTo: string;
  umrahDate: string;
  /** How the traveller reaches Makkah: flying into Jeddah, or from a stay in Jeddah. */
  route: "air" | "jeddah";
  fromCity: string | null;
  travellers: { name: string; permits: NusukPermit[] | null }[];
  pause: { from: string; to: string } | null;
  demo?: boolean;
}

const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
export const demoUmrahEnabled = () => mtConfig().mock && process.env.DEMO_UMRAH !== "off";
/** Days before departure to remind the traveller to book in Nusuk. */
export const BOOK_REMINDER_DAYS = 5;

function makkahOf(stays: { city: string; checkIn: string; checkOut: string; nights: number }[]) {
  const i = stays.findIndex((s) => s.city === UMRAH_CITY);
  if (i < 0) return null;
  const s = stays[i];
  const prev = i > 0 ? stays[i - 1].city : null;
  return {
    from: s.checkIn, to: s.checkOut,
    // The first full day there (the arrival day itself on a one-night stay).
    umrahDate: s.nights >= 2 ? addDays(s.checkIn, 1) : s.checkIn,
    route: prev === "JED" ? ("jeddah" as const) : ("air" as const),
    fromCity: prev,
  };
}

export async function listUmrahTrips(userId: string, now = new Date()): Promise<UmrahTrip[]> {
  const today = ksaToday(now);
  const season = await getUmrahSeason();
  const out: UmrahTrip[] = [];
  for (const b of await listBookingsByUser(userId)) {
    if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED" || b.criteria.returnDate < today) continue;
    const m = makkahOf(stayDates(b.criteria));
    if (!m) continue;
    const travellers = await Promise.all(b.applicants.map(async (a) => ({
      name: a.nameEn,
      permits: nusukLinked() ? await nusukPermits(a.passportNo, a.nationality) : null,
    })));
    out.push({
      id: `booking:${b.id}`, bookingId: b.id, planId: null, reference: b.reference, departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate,
      makkahFrom: m.from, makkahTo: m.to, umrahDate: m.umrahDate, route: m.route, fromCity: m.fromCity, travellers, pause: pauseOverlap(season, m.from, m.to),
    });
  }
  for (const p of await listPlans(userId)) {
    if (p.status !== "draft" || !p.request.umrah || p.returnDate < today) continue;
    const m = makkahOf(stayDates({ ...p.request, stays: p.stays, returnDate: p.returnDate } as never));
    if (!m) continue;
    const marked = p.days.find((d) => d.umrah)?.date;
    out.push({
      id: `plan:${p.id}`, bookingId: null, planId: p.id, reference: null, departureDate: p.request.departureDate, returnDate: p.returnDate,
      makkahFrom: m.from, makkahTo: m.to, umrahDate: marked ?? m.umrahDate, route: m.route, fromCity: m.fromCity, travellers: [], pause: pauseOverlap(season, m.from, m.to),
    });
  }
  if (!out.length && demoUmrahEnabled()) out.push(demoTrip(today));
  return out.sort((a, b) => a.departureDate.localeCompare(b.departureDate));
}

/** A sample trip (sandbox): Jeddah then two nights in Makkah, ten days from now. */
function demoTrip(today: string): UmrahTrip {
  const dep = addDays(today, 10);
  return {
    id: "demo", bookingId: null, planId: null, reference: "TA-DEMO2026", departureDate: dep, returnDate: addDays(dep, 5),
    makkahFrom: addDays(dep, 2), makkahTo: addDays(dep, 4), umrahDate: addDays(dep, 3), route: "jeddah", fromCity: "JED",
    travellers: [{ name: "AHMED ALI", permits: null }], pause: null, demo: true,
  };
}

/* ------------------------------------------------------------ reminders */

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  const sent = await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }, { bookingId: doc.bookingId });
  if (sent) await store().update<AppNotification>("notifications", doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
}

/** «Book your Umrah appointment in Nusuk» a few days before the trip, and the Umrah-day reminder. */
export async function umrahReminders(userId: string, now = new Date()): Promise<number> {
  const today = ksaToday(now);
  let n = 0;
  for (const t of await listUmrahTrips(userId, now)) {
    if (!t.bookingId || t.demo) continue;
    const base = { userId, kind: "umrah" as const, bookingId: t.bookingId, reference: t.reference ?? "", createdAt: now.toISOString(), href: "/umrah", readAt: null, deletedAt: null, email: null };
    const d = (x: string, ar: boolean) => new Date(`${x}T12:00:00Z`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
    if (today >= addDays(t.departureDate, -BOOK_REMINDER_DAYS) && today <= t.makkahFrom) {
      const pauseAr = t.pause ? [`⚠️ رحلتك تقع في فترة إيقاف تصاريح العمرة لموسم الحج (${t.pause.from} – ${t.pause.to}).`] : [];
      const pauseEn = t.pause ? [`⚠️ Your trip falls in the Umrah permit pause for the Hajj season (${t.pause.from} – ${t.pause.to}).`] : [];
      await notify(userId, {
        ...base, id: `umrah:book:${t.bookingId}`,
        titleAr: "احجز موعد العمرة في تطبيق نسك", titleEn: "Book your Umrah appointment in Nusuk",
        linesAr: [`يوم العمرة في برنامجك: ${d(t.umrahDate, true)}. احجز التصريح في «نسك» بجوازك ورقم تأشيرتك قبل الرحلة.`, ...pauseAr],
        linesEn: [`Your Umrah day: ${d(t.umrahDate, false)}. Book the permit in Nusuk with your passport and visa number before the trip.`, ...pauseEn],
        ...(t.pause ? { severity: "warning" as const } : {}),
      });
      n++;
    }
    if (today === t.umrahDate) {
      const miqatAr = t.route === "jeddah" ? "من جدة إلى مكة: راجع صفحة العمرة لمعرفة موضع الإحرام." : "أحرم من الميقات قبل تجاوزه.";
      const miqatEn = t.route === "jeddah" ? "From Jeddah to Makkah: see the Umrah page for where to enter ihram." : "Enter ihram at the miqat before passing it.";
      await notify(userId, {
        ...base, id: `umrah:day:${t.bookingId}`,
        titleAr: "اليوم يوم عمرتك — تقبّل الله منك", titleEn: "Today is your Umrah day",
        linesAr: [miqatAr, "احمل تصريح نسك وجوازك، واشرب الماء باستمرار، واتبع إرشادات المنظمين في المسجد الحرام."],
        linesEn: [miqatEn, "Carry your Nusuk permit and passport, keep drinking water, and follow the stewards' guidance at the Holy Mosque."],
      });
      n++;
    }
  }
  return n;
}
