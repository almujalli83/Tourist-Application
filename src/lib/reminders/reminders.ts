/**
 * Trip reminders: before arrival (3 days ahead: flight, hotel, visa, eSIM and the first day's
 * programme), before departure (the day before: return flight and when to be at the airport) and
 * before the visa expires (7 days and 1 day ahead). Each reminder is created once per booking — in
 * the account's notifications and by email to the account and the travellers. Travellers can delete
 * a notification (it isn't created again) but can't turn reminders off.
 *
 * Reminders are created by the daily job (`/api/cron/reminders`) and, for the signed-in traveller,
 * whenever the notifications are loaded, so they also appear without the job.
 */
import type { StoredBooking } from "../bookings/types";
import { cityName } from "../data/cities";
import { addDays } from "../dates";
import { fmtDay } from "../events/format";
import { notifyTravellers } from "../notify";
import { planForBooking } from "../planner/plans";
import { getUserById, listBookingsByUser } from "../repo";
import { requestReviews } from "../reviews/reviews";
import { store } from "../store";

export type ReminderKind = "arrival" | "departure" | "visa7" | "visa1";

/** Notification kinds: trip reminders, and requests to rate experiences (service 9). */
export type NotificationKind = ReminderKind | "review";

export interface AppNotification {
  /** `${bookingId}:${kind}` (for visa reminders also the expiry date). */
  id: string;
  userId: string;
  kind: NotificationKind;
  bookingId: string;
  reference: string;
  createdAt: string;
  titleAr: string;
  titleEn: string;
  linesAr: string[];
  linesEn: string[];
  /** In-app link without the locale, e.g. "/account/bookings/…". */
  href: string;
  readAt: string | null;
  /** Deleted by the traveller: hidden, and kept so it isn't created again. */
  deletedAt: string | null;
  email: { to: string[]; status: string } | null;
  /** Sample notification shown in sandbox mode (see demo.ts). */
  demo?: boolean;
}

/** Be at the airport this long before an international take-off. */
const AIRPORT_BEFORE_MIN = 180;
const ARRIVAL_DAYS_AHEAD = 3;
const COL = "notifications" as const;

const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
/** Flight times are local Saudi time. */
const ksaMs = (local: string) => Date.parse(`${local}:00+03:00`);
const hhmm = (local: string) => local.slice(11, 16);
const minusMinutes = (local: string, mins: number) => new Date(ksaMs(local) - mins * 60_000 + 3 * 3600_000).toISOString().slice(11, 16);
const day = (d: string, locale: "ar" | "en") => fmtDay(d, locale, { weekday: "long", day: "numeric", month: "long" });

function active(b: StoredBooking) {
  return b.status !== "CANCELLED" && b.mt.packageStatus !== "CANCELLED";
}

/** The earliest issued-visa expiry of the booking's travellers, with their names. */
export function visaExpiry(b: StoredBooking): { date: string; names: string[] } | null {
  const issued = b.applicants.filter((a) => a.visaNumber && a.visaExpiryDate);
  if (!issued.length) return null;
  const date = issued.map((a) => a.visaExpiryDate!).sort()[0];
  return { date, names: issued.filter((a) => a.visaExpiryDate === date).map((a) => a.nameEn) };
}

/** Reminders due for the booking now (kind and the notification id), whether or not already sent. */
export function dueReminders(b: StoredBooking, now: Date): { kind: ReminderKind; id: string }[] {
  if (!active(b)) return [];
  const today = ksaToday(now);
  const { departureDate, returnDate } = b.criteria;
  const out: { kind: ReminderKind; id: string }[] = [];
  if (today >= addDays(departureDate, -ARRIVAL_DAYS_AHEAD) && today < departureDate) out.push({ kind: "arrival", id: `${b.id}:arrival` });
  const ret = b.flights.find((f) => f.kind === "return");
  const cutoff = ret ? ksaMs(ret.departAt) - AIRPORT_BEFORE_MIN * 60_000 : Date.parse(`${returnDate}T00:00:00+03:00`);
  if (today >= addDays(returnDate, -1) && now.getTime() < cutoff) out.push({ kind: "departure", id: `${b.id}:departure` });
  const visa = visaExpiry(b);
  if (visa) {
    if (today >= addDays(visa.date, -7) && today <= addDays(visa.date, -2)) out.push({ kind: "visa7", id: `${b.id}:visa7:${visa.date}` });
    if (today >= addDays(visa.date, -1) && today <= visa.date) out.push({ kind: "visa1", id: `${b.id}:visa1:${visa.date}` });
  }
  return out;
}

/* ---------------------------------------------------------------- content */

export type Content = Pick<AppNotification, "titleAr" | "titleEn" | "linesAr" | "linesEn" | "href">;

async function arrivalContent(b: StoredBooking, now: Date): Promise<Content> {
  const today = ksaToday(now);
  const n = Math.round((Date.parse(b.criteria.departureDate) - Date.parse(today)) / 86_400_000);
  const out = b.flights.find((f) => f.kind === "outbound");
  const hotel = b.hotels[0];
  const issued = b.applicants.length > 0 && b.applicants.every((a) => a.visaNumber);
  const esim = !!b.esim?.orderId && !b.esim.failed;
  const ar: string[] = [];
  const en: string[] = [];
  if (out) {
    ar.push(`✈️ رحلة الوصول ${out.carrierNameAr} ${out.flightNo}: ${cityName(out.from, "ar")} ← ${cityName(out.to, "ar")}، الهبوط ${day(out.arriveAt.slice(0, 10), "ar")} الساعة ${hhmm(out.arriveAt)}.`);
    en.push(`✈️ Arrival flight ${out.carrierNameEn} ${out.flightNo}: ${cityName(out.from, "en")} → ${cityName(out.to, "en")}, landing ${day(out.arriveAt.slice(0, 10), "en")} at ${hhmm(out.arriveAt)}.`);
  }
  if (hotel) {
    ar.push(`🏨 الفندق الأول: ${hotel.nameAr} (${cityName(hotel.city, "ar")})، الدخول ${day(hotel.checkIn, "ar")}.`);
    en.push(`🏨 First hotel: ${hotel.nameEn} (${cityName(hotel.city, "en")}), check-in ${day(hotel.checkIn, "en")}.`);
  }
  ar.push("🛂 جهّز جوازات السفر (صالحة 6 أشهر على الأقل من الوصول).");
  en.push("🛂 Have your passports ready (valid at least 6 months from arrival).");
  ar.push(issued ? "✅ التأشيرات صادرة ومحفوظة في المحفظة الرقمية مع وثائق التأمين." : "⏳ التأشيرة قيد المعالجة لدى وزارة السياحة، وسنبلغك فور صدورها.");
  en.push(issued ? "✅ Your visas are issued and saved in your digital wallet with the insurance documents." : "⏳ Your visa is still being processed by the Ministry of Tourism; we'll let you know once it's issued.");
  ar.push(esim ? "📶 ثبّت شريحة eSIM قبل السفر لتعمل فور الوصول (الرابط في بريد الشريحة)." : "📶 لا توجد شريحة eSIM — احجز واحدة من صفحة «شريحة eSIM» لتتصل بالإنترنت فور الوصول.");
  en.push(esim ? "📶 Install your eSIM before you fly so it works as soon as you land (link in the eSIM email)." : "📶 No eSIM yet — get one on the «Travel eSIM» page to be online as soon as you land.");
  const plan = await planForBooking(b.userId, b.id);
  const first = plan?.days.find((d) => d.type !== "arrival" && d.items.length) ?? null;
  if (first) {
    const item = (lang: "ar" | "en") => (i: (typeof first.items)[number]) => `${lang === "ar" ? i.titleAr : i.titleEn}${i.fixedStart ? ` (${i.fixedStart})` : ""}`;
    ar.push(`🗓️ أول يوم في برنامجك (${day(first.date, "ar")}): ${first.items.slice(0, 4).map(item("ar")).join("، ")}.`);
    en.push(`🗓️ First day of your programme (${day(first.date, "en")}): ${first.items.slice(0, 4).map(item("en")).join(", ")}.`);
  }
  return {
    titleAr: n <= 1 ? `رحلتك إلى السعودية غدًا — ${b.reference}` : `رحلتك إلى السعودية بعد ${n} أيام — ${b.reference}`,
    titleEn: n <= 1 ? `Your trip to Saudi Arabia is tomorrow — ${b.reference}` : `Your trip to Saudi Arabia is in ${n} days — ${b.reference}`,
    linesAr: ar,
    linesEn: en,
    href: `/account/bookings/${b.id}`,
  };
}

function departureContent(b: StoredBooking, now: Date): Content {
  const today = ksaToday(now);
  const ret = b.flights.find((f) => f.kind === "return");
  const hotel = b.hotels[b.hotels.length - 1];
  const isToday = today >= b.criteria.returnDate;
  const ar: string[] = [];
  const en: string[] = [];
  if (ret) {
    ar.push(`✈️ رحلة العودة ${ret.carrierNameAr} ${ret.flightNo}: ${cityName(ret.from, "ar")} ← ${cityName(ret.to, "ar")}، الإقلاع ${day(ret.departAt.slice(0, 10), "ar")} الساعة ${hhmm(ret.departAt)}.`);
    en.push(`✈️ Return flight ${ret.carrierNameEn} ${ret.flightNo}: ${cityName(ret.from, "en")} → ${cityName(ret.to, "en")}, take-off ${day(ret.departAt.slice(0, 10), "en")} at ${hhmm(ret.departAt)}.`);
    ar.push(`⏰ كن في المطار قبل الساعة ${minusMinutes(ret.departAt, AIRPORT_BEFORE_MIN)} (3 ساعات قبل الإقلاع للرحلات الدولية).`);
    en.push(`⏰ Be at the airport by ${minusMinutes(ret.departAt, AIRPORT_BEFORE_MIN)} (3 hours before an international take-off).`);
  }
  if (hotel) {
    ar.push(`🏨 سجّل المغادرة من ${hotel.nameAr} وتأكد من استلام متعلقاتك.`);
    en.push(`🏨 Check out of ${hotel.nameEn} and collect your belongings.`);
  }
  ar.push("🛂 احمل جواز السفر، والتأشيرة متاحة في المحفظة الرقمية عند الحاجة.");
  en.push("🛂 Keep your passport with you; your visa is in your digital wallet if needed.");
  return {
    titleAr: isToday ? `موعد مغادرتك اليوم — ${b.reference}` : `موعد مغادرتك غدًا — ${b.reference}`,
    titleEn: isToday ? `You leave today — ${b.reference}` : `You leave tomorrow — ${b.reference}`,
    linesAr: ar,
    linesEn: en,
    href: `/account/bookings/${b.id}`,
  };
}

function visaContent(b: StoredBooking, kind: "visa7" | "visa1", now: Date): Content {
  const visa = visaExpiry(b)!;
  const today = ksaToday(now);
  const n = Math.round((Date.parse(visa.date) - Date.parse(today)) / 86_400_000);
  const inTrip = today >= b.criteria.departureDate && today <= b.criteria.returnDate;
  const whenAr = n <= 0 ? "اليوم" : n === 1 ? "غدًا" : `بعد ${n} أيام`;
  const whenEn = n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`;
  const ar = [`🛂 تنتهي تأشيرة ${visa.names.join("، ")} في ${day(visa.date, "ar")}.`];
  const en = [`🛂 The visa of ${visa.names.join(", ")} expires on ${day(visa.date, "en")}.`];
  if (inTrip) {
    ar.push("⚠️ يجب مغادرة المملكة قبل انتهاء التأشيرة لتجنّب المخالفة.");
    en.push("⚠️ You must leave Saudi Arabia before the visa expires to avoid a violation.");
  } else {
    ar.push("التأشيرة متعددة الدخول؛ لأي رحلة بعد هذا التاريخ تحتاج باقة وتأشيرة جديدة.");
    en.push("It's a multiple-entry visa; any trip after this date needs a new package and visa.");
  }
  return {
    titleAr: `تأشيرتك تنتهي ${whenAr} — ${b.reference}`,
    titleEn: `Your visa expires ${whenEn} — ${b.reference}`,
    linesAr: ar,
    linesEn: en,
    href: kind === "visa1" && !inTrip ? "/package-visa" : "/account/wallet",
  };
}

export function content(b: StoredBooking, kind: ReminderKind, now: Date): Promise<Content> | Content {
  return kind === "arrival" ? arrivalContent(b, now) : kind === "departure" ? departureContent(b, now) : visaContent(b, kind, now);
}

/* ------------------------------------------------------------------ run */

function emailText(c: Content, reference: string) {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const site = (process.env.PUBLIC_SITE_URL?.trim() || (vercel ? `https://${vercel}` : "")).replace(/\/$/, "");
  const link = (locale: string) => (site ? `\n${site}/${locale}${c.href}` : "");
  return {
    subject: `Saudi Trip — ${c.titleEn} / ${c.titleAr.replace(` — ${reference}`, "")}`,
    text: [c.titleEn, ...c.linesEn, link("en"), "", c.titleAr, ...c.linesAr, link("ar")].join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

/** Creates the due reminders of these bookings that weren't created yet; returns how many were. */
async function remind(bookings: StoredBooking[], now: Date): Promise<number> {
  let created = 0;
  for (const b of bookings) {
    for (const r of dueReminders(b, now)) {
      if (await store().get(COL, r.id)) continue;
      const c = await content(b, r.kind, now);
      const doc: AppNotification = {
        id: r.id, userId: b.userId, kind: r.kind, bookingId: b.id, reference: b.reference, createdAt: now.toISOString(),
        ...c, readAt: null, deletedAt: null, email: null,
      };
      // Inserted once: concurrent runs can't send the email twice.
      if (!(await store().insert(COL, r.id, doc))) continue;
      created++;
      const owner = await getUserById(b.userId);
      const to = [owner?.email ?? "", ...b.applicants.map((a) => a.email)];
      const sent = await notifyTravellers(to, emailText(c, b.reference), { bookingId: b.id });
      if (sent) await store().update<AppNotification>(COL, r.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
    }
  }
  return created;
}

/** Daily job: reminders for every booking. */
export async function runReminders(now = new Date()): Promise<{ bookings: number; created: number; reviewRequests: number }> {
  const bookings = (await store().list<StoredBooking>("bookings", 100_000)).filter(active);
  const created = await remind(bookings, now);
  let reviewRequests = 0;
  for (const u of await store().list<{ id: string }>("users", 100_000)) if (await requestReviews(u.id, now)) reviewRequests++;
  return { bookings: bookings.length, created, reviewRequests };
}

/** The account's notifications, newest first (its due reminders are created first). */
export async function listNotifications(userId: string, now = new Date()): Promise<AppNotification[]> {
  await remind(await listBookingsByUser(userId), now);
  await requestReviews(userId, now);
  const rows = await store().findBy<AppNotification>(COL, "userId", userId);
  return rows.filter((n) => !n.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markRead(userId: string, now = new Date()): Promise<void> {
  for (const n of await store().findBy<AppNotification>(COL, "userId", userId)) {
    if (!n.readAt && !n.deletedAt) await store().update<AppNotification>(COL, n.id, (x) => ({ ...x, readAt: now.toISOString() }));
  }
}

export async function deleteNotification(userId: string, id: string, now = new Date()): Promise<boolean> {
  const n = await store().get<AppNotification>(COL, id);
  if (!n || n.userId !== userId || n.deletedAt) return false;
  await store().update<AppNotification>(COL, id, (x) => ({ ...x, deletedAt: now.toISOString(), readAt: x.readAt ?? now.toISOString() }));
  return true;
}
