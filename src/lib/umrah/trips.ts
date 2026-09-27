/**
 * The traveller's Umrah trips (packages and draft plans with a Makkah stay): the Umrah day, the way
 * to Makkah (flying into Jeddah, or from Jeddah by road), the Hajj-season warning, the days on which
 * Nusuk permits can be requested (Umrah: the nights in Makkah; Rawdah: the days in Madinah), the
 * permits issued, and the reminders.
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
import type { PublicPermit, StoredPermit } from "./permits";
import { nusukProvider } from "./nusuk";
import { getUmrahSeason, pauseOverlap, type UmrahSeason } from "./season";

export interface UmrahTrip {
  id: string;
  /** Key for permits: the booking id, or "demo" (sandbox sample); null for a draft plan. */
  key: string | null;
  bookingId: string | null;
  planId: string | null;
  reference: string | null;
  departureDate: string;
  returnDate: string;
  makkahFrom: string;
  makkahTo: string;
  madinahFrom: string | null;
  madinahTo: string | null;
  umrahDate: string;
  /** How the traveller reaches Makkah: flying into Jeddah, or from a stay in Jeddah. */
  route: "air" | "jeddah";
  fromCity: string | null;
  /** Travellers of the booking; permits can be issued once the visa is. */
  travellers: { applicationNo: string; name: string; visa: boolean }[];
  pause: { from: string; to: string } | null;
  /** Days on which a permit can be requested now. */
  windows: { umrah: string[]; rawdah: string[] };
  permits: PublicPermit[];
  demo?: boolean;
}

/** Server-side context of a trip (with the passport data Nusuk needs). */
export interface TripContext extends UmrahTrip {
  people: { applicationNo: string; nameEn: string; passportNo: string; nationality: string; visaNumber: string | null }[];
}

const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
export const demoUmrahEnabled = () => mtConfig().mock && process.env.DEMO_UMRAH !== "off";
/** Days before departure to remind the traveller to book the permit. */
export const BOOK_REMINDER_DAYS = 5;

type Stay = { city: string; checkIn: string; checkOut: string; nights: number };

function daysBetween(from: string, to: string, inclusive: boolean): string[] {
  const out: string[] = [];
  for (let d = from; inclusive ? d <= to : d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

function shape(stays: Stay[], season: UmrahSeason, today: string) {
  const i = stays.findIndex((s) => s.city === UMRAH_CITY);
  if (i < 0) return null;
  const s = stays[i];
  const prev = i > 0 ? stays[i - 1].city : null;
  const med = stays.find((x) => x.city === "MED") ?? null;
  const pause = pauseOverlap(season, s.checkIn, s.checkOut);
  const inPause = (d: string) => !!season.pauseFrom && !!season.pauseTo && d >= season.pauseFrom && d <= season.pauseTo;
  return {
    makkahFrom: s.checkIn, makkahTo: s.checkOut,
    madinahFrom: med?.checkIn ?? null, madinahTo: med?.checkOut ?? null,
    // The first full day there (the arrival day itself on a one-night stay).
    umrahDate: s.nights >= 2 ? addDays(s.checkIn, 1) : s.checkIn,
    route: prev === "JED" ? ("jeddah" as const) : ("air" as const),
    fromCity: prev,
    pause,
    windows: {
      umrah: daysBetween(s.checkIn, s.checkOut, false).filter((d) => d >= today && !inPause(d)),
      rawdah: med ? daysBetween(med.checkIn, med.checkOut, true).filter((d) => d >= today) : [],
    },
    /** Every day of the stays (whatever today is): permits outside them no longer fit the trip. */
    stayDays: { umrah: daysBetween(s.checkIn, s.checkOut, false), rawdah: med ? daysBetween(med.checkIn, med.checkOut, true) : [] },
  };
}

export async function tripContexts(userId: string, now = new Date()): Promise<(TripContext & { stayDays: { umrah: string[]; rawdah: string[] }; cancelled?: boolean })[]> {
  const today = ksaToday(now);
  const season = await getUmrahSeason();
  const out: (TripContext & { stayDays: { umrah: string[]; rawdah: string[] }; cancelled?: boolean })[] = [];
  for (const b of await listBookingsByUser(userId)) {
    const m = shape(stayDates(b.criteria), season, today);
    if (!m) continue;
    const cancelled = b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED";
    const people = b.applicants.map((a) => ({ applicationNo: a.applicationNo, nameEn: a.nameEn, passportNo: a.passportNo, nationality: a.nationality, visaNumber: a.visaNumber }));
    out.push({
      id: `booking:${b.id}`, key: b.id, bookingId: b.id, planId: null, reference: b.reference, departureDate: b.criteria.departureDate, returnDate: b.criteria.returnDate,
      ...m, travellers: people.map((p) => ({ applicationNo: p.applicationNo, name: p.nameEn, visa: !!p.visaNumber })), permits: [], people,
      ...(cancelled ? { cancelled: true, windows: { umrah: [], rawdah: [] } } : {}),
    });
  }
  for (const p of await listPlans(userId)) {
    if (p.status !== "draft" || !p.request.umrah || p.returnDate < today) continue;
    const m = shape(stayDates({ ...p.request, stays: p.stays, returnDate: p.returnDate } as never), season, today);
    if (!m) continue;
    const marked = p.days.find((d) => d.umrah)?.date;
    out.push({
      id: `plan:${p.id}`, key: null, bookingId: null, planId: p.id, reference: null, departureDate: p.request.departureDate, returnDate: p.returnDate,
      ...m, umrahDate: marked ?? m.umrahDate, windows: { umrah: [], rawdah: [] }, travellers: [], permits: [], people: [],
    });
  }
  if (!out.length && demoUmrahEnabled()) out.push(demoTrip(today, season));
  return out;
}

/** A sample trip (sandbox): Jeddah, two nights in Makkah, then Madinah, ten days from now. */
function demoTrip(today: string, season: UmrahSeason): TripContext & { stayDays: { umrah: string[]; rawdah: string[] } } {
  const dep = addDays(today, 10);
  const stays: Stay[] = [
    { city: "JED", checkIn: dep, checkOut: addDays(dep, 2), nights: 2 },
    { city: UMRAH_CITY, checkIn: addDays(dep, 2), checkOut: addDays(dep, 4), nights: 2 },
    { city: "MED", checkIn: addDays(dep, 4), checkOut: addDays(dep, 5), nights: 1 },
  ];
  const m = shape(stays, season, today)!;
  const people = [
    { applicationNo: "demo-1", nameEn: "AHMED ALI", passportNo: "A00000001", nationality: "EG", visaNumber: "6000000001" },
    { applicationNo: "demo-2", nameEn: "FATIMA ALI", passportNo: "A00000002", nationality: "EG", visaNumber: "6000000002" },
  ];
  return {
    id: "demo", key: "demo", bookingId: null, planId: null, reference: "TA-DEMO2026", departureDate: dep, returnDate: addDays(dep, 5),
    ...m, travellers: people.map((p) => ({ applicationNo: p.applicationNo, name: p.nameEn, visa: true })), permits: [], people, demo: true,
  };
}

export async function listUmrahTrips(userId: string, now = new Date()): Promise<UmrahTrip[]> {
  const today = ksaToday(now);
  const permits = (await store().findBy<StoredPermit>("umrahPermits", "userId", userId)).filter((p) => p.status === "issued");
  const { toPublicPermit } = await import("./permits");
  return (await tripContexts(userId, now))
    .filter((t) => !t.cancelled && t.returnDate >= today)
    .map(({ people: _p, stayDays: _s, cancelled: _c, ...t }) => ({ ...t, permits: t.key ? permits.filter((p) => p.tripKey === t.key).map(toPublicPermit) : [] })) // eslint-disable-line @typescript-eslint/no-unused-vars
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
}

/* ------------------------------------------------------------ reminders */

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return;
  const user = await getUserById(userId);
  if (!user) return;
  const sent = await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }, { bookingId: doc.bookingId });
  if (sent) await store().update<AppNotification>("notifications", doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
}
export { notify as notifyUmrah };

/** «Book your Umrah permit» a few days before the trip (unless everyone has one), and the Umrah-day reminder. */
export async function umrahReminders(userId: string, now = new Date()): Promise<number> {
  const today = ksaToday(now);
  const auto = !!nusukProvider();
  const { reconcilePermits } = await import("./permits");
  await reconcilePermits(userId, now);
  let n = 0;
  for (const t of await listUmrahTrips(userId, now)) {
    if (!t.bookingId || t.demo) continue;
    const base = { userId, kind: "umrah" as const, bookingId: t.bookingId, reference: t.reference ?? "", createdAt: now.toISOString(), href: "/umrah", readAt: null, deletedAt: null, email: null };
    const d = (x: string, ar: boolean) => new Date(`${x}T12:00:00Z`).toLocaleDateString(ar ? "ar-SA-u-ca-gregory" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
    const allHave = t.travellers.length > 0 && t.travellers.every((x) => t.permits.some((p) => p.type === "umrah" && p.travellers.some((y) => y.applicationNo === x.applicationNo)));
    // As soon as the visas are issued: book early, while the times are open.
    if (!allHave && t.travellers.some((x) => x.visa) && today <= t.makkahFrom) {
      await notify(userId, {
        ...base, id: `umrah:visas:${t.bookingId}`,
        titleAr: "صدرت تأشيرتك — احجز موعد العمرة الآن", titleEn: "Your visa is issued — book your Umrah time now",
        linesAr: [
          auto ? "اختر يوم العمرة ووقتها (وموعد الروضة الشريفة إن كانت المدينة في رحلتك) قبل امتلاء الأوقات، ويصدر التصريح من «نسك» تلقائيًا." : "احجز موعد العمرة (والروضة الشريفة إن كانت المدينة في رحلتك) في تطبيق «نسك» قبل امتلاء الأوقات.",
          `يوم العمرة في برنامجك: ${d(t.umrahDate, true)}.`,
        ],
        linesEn: [
          auto ? "Pick your Umrah day and time (and a Rawdah visit if Madinah is in your trip) before the times fill up; Nusuk issues the permit automatically." : "Book your Umrah time (and a Rawdah visit if Madinah is in your trip) in the Nusuk app before the times fill up.",
          `Your Umrah day: ${d(t.umrahDate, false)}.`,
        ],
      });
      n++;
    }
    if (!allHave && today >= addDays(t.departureDate, -BOOK_REMINDER_DAYS) && today <= t.makkahFrom) {
      const pauseAr = t.pause ? [`⚠️ رحلتك تقع في فترة إيقاف تصاريح العمرة لموسم الحج (${t.pause.from} – ${t.pause.to}).`] : [];
      const pauseEn = t.pause ? [`⚠️ Your trip falls in the Umrah permit pause for the Hajj season (${t.pause.from} – ${t.pause.to}).`] : [];
      await notify(userId, {
        ...base, id: `umrah:book:${t.bookingId}`,
        titleAr: "احجز تصريح العمرة", titleEn: "Book your Umrah permit",
        linesAr: [
          `يوم العمرة في برنامجك: ${d(t.umrahDate, true)}.`,
          auto ? "اختر اليوم والوقت المناسبين من صفحة العمرة، ويصدر التصريح من «نسك» تلقائيًا." : "احجز التصريح في تطبيق «نسك» بجوازك ورقم تأشيرتك قبل الرحلة.",
          ...pauseAr,
        ],
        linesEn: [
          `Your Umrah day: ${d(t.umrahDate, false)}.`,
          auto ? "Pick the day and time on the Umrah page and the permit is issued by Nusuk automatically." : "Book the permit in the Nusuk app with your passport and visa number before the trip.",
          ...pauseEn,
        ],
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
