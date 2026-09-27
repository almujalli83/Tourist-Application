/**
 * Service 15 — trip alerts, created once each (in the notifications and by email):
 * - weather hazards (heat, rain, wind, dust) on a day of the trip, for the city of that day, with
 *   the day's outdoor activities to move — always on;
 * - booked event: a reminder 2 hours before, and a notice when its session is changed or cancelled
 *   — always on;
 * - the day's programme each morning of the trip (plan + weather) — can be turned off;
 * - new events in the trip's cities and dates matching the traveller's interests: once in the week
 *   before the trip and every other day during it — can be turned off.
 * Alerts are created by the daily job and whenever the traveller's notifications are loaded.
 */
import type { StoredBooking } from "../bookings/types";
import { cityName } from "../data/cities";
import { addDays } from "../dates";
import { fmtDay, fmtKsa } from "../events/format";
import { eventsCatalog, getEventForSession, listOrders } from "../events/orders";
import { CITY_CENTERS } from "../guide/centers";
import { stayDates } from "../itinerary";
import { notifyTravellers } from "../notify";
import { planForBooking } from "../planner/plans";
import type { AppNotification } from "../reminders/reminders";
import { getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { forecast, hazardsOf, type DayWeather, type Hazard } from "../weather/forecast";

export interface AlertPrefs {
  id: string;
  eventSuggestions: boolean;
  dailyProgramme: boolean;
}

const COL = "notifications" as const;
const OUTDOOR = new Set(["nature", "beach", "park", "heritage", "landmark"]);
const ksaDate = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const ksaHour = (now: Date) => new Date(now.getTime() + 3 * 3600_000).getUTCHours();
const day = (d: string, l: "ar" | "en") => fmtDay(d, l, { weekday: "long", day: "numeric", month: "long" });

export async function getAlertPrefs(userId: string): Promise<AlertPrefs> {
  return (await store().get<AlertPrefs>("alertPrefs", userId)) ?? { id: userId, eventSuggestions: true, dailyProgramme: true };
}

export async function setAlertPrefs(userId: string, patch: Partial<Pick<AlertPrefs, "eventSuggestions" | "dailyProgramme">>): Promise<AlertPrefs> {
  const next = { ...(await getAlertPrefs(userId)), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v === "boolean")), id: userId };
  await store().put("alertPrefs", userId, next);
  return next;
}

/** The city where the traveller is on a day of the trip. */
export function cityOn(b: Pick<StoredBooking, "criteria">, date: string): string {
  const stays = stayDates(b.criteria);
  return (stays.find((s) => date >= s.checkIn && date < s.checkOut) ?? stays[stays.length - 1]).city;
}

/* ----------------------------------------------------------------- texts */

const HAZARD: Record<Hazard["kind"], { labelAr: string; labelEn: string; ar: (v: number) => string; en: (v: number) => string; adviceAr: string; adviceEn: string }> = {
  heat: {
    labelAr: "حرارة شديدة", labelEn: "extreme heat",
    ar: (v) => `🌡️ حرارة شديدة: العظمى ${v}°`, en: (v) => `🌡️ Extreme heat: high of ${v}°C`,
    adviceAr: "اشرب الماء باستمرار، وتجنب الشمس بين 11 صباحًا و4 عصرًا، وانقل الزيارات الخارجية إلى الصباح الباكر أو المساء.",
    adviceEn: "Drink water often, avoid the sun from 11 am to 4 pm, and move outdoor visits to the early morning or evening.",
  },
  rain: {
    labelAr: "أمطار", labelEn: "rain",
    ar: (v) => `🌧️ أمطار متوقعة: ${v} مم`, en: (v) => `🌧️ Rain expected: ${v} mm`,
    adviceAr: "خذ مظلة، وابتعد عن الأودية ومجاري السيول، وتحقق من الطرق قبل التنقل بين المدن.",
    adviceEn: "Take an umbrella, keep away from wadis and flood channels, and check roads before driving between cities.",
  },
  wind: {
    labelAr: "رياح نشطة", labelEn: "strong winds",
    ar: (v) => `💨 رياح نشطة: هبّات حتى ${v} كم/س`, en: (v) => `💨 Strong winds: gusts up to ${v} km/h`,
    adviceAr: "تجنب الأنشطة البحرية والصحراوية، وانتبه أثناء القيادة.",
    adviceEn: "Avoid sea and desert activities, and take care when driving.",
  },
  dust: {
    labelAr: "غبار", labelEn: "dust",
    ar: () => "🌫️ غبار أو عاصفة رملية متوقعة", en: () => "🌫️ Dust or a sandstorm expected",
    adviceAr: "ارتدِ كمامة، وخصوصًا لمرضى الربو، واستبدل الأنشطة الخارجية بالمتاحف والمراكز التجارية.",
    adviceEn: "Wear a mask (especially with asthma) and swap outdoor activities for museums and malls.",
  },
};

export function weatherLine(w: DayWeather, l: "ar" | "en"): string {
  return l === "ar"
    ? `☀️ الطقس: العظمى ${w.tMax}° والصغرى ${w.tMin}°${w.rainChance >= 40 ? `، احتمال أمطار ${w.rainChance}%` : ""}`
    : `☀️ Weather: high ${w.tMax}°C, low ${w.tMin}°C${w.rainChance >= 40 ? `, ${w.rainChance}% chance of rain` : ""}`;
}

/** Weather lines for a stay (pre-arrival reminder): the forecast of each city of the trip within range. */
export async function tripWeatherLines(b: Pick<StoredBooking, "criteria">): Promise<{ ar: string[]; en: string[] }> {
  const ar: string[] = [];
  const en: string[] = [];
  if (!b.criteria.stays?.length) return { ar, en };
  for (const s of stayDates(b.criteria)) {
    const c = CITY_CENTERS[s.city];
    const days = c ? (await forecast(c.lat, c.lng))?.filter((d) => d.date >= s.checkIn && d.date < s.checkOut) : null;
    if (!days?.length) continue;
    const hi = Math.max(...days.map((d) => d.tMax));
    const lo = Math.min(...days.map((d) => d.tMin));
    const hz = [...new Set(days.flatMap(hazardsOf).map((h) => h.kind))];
    ar.push(`☀️ الطقس المتوقع في ${cityName(s.city, "ar")}: بين ${lo}° و${hi}°${hz.length ? ` — متوقع: ${hz.map((k) => HAZARD[k].labelAr).join("، ")}` : ""}.`);
    en.push(`☀️ Expected weather in ${cityName(s.city, "en")}: ${lo}–${hi}°C${hz.length ? ` — expect ${hz.map((k) => HAZARD[k].labelEn).join(", ")}` : ""}.`);
    if (hi >= 38) {
      ar.push("👕 ملابس خفيفة وقبعة وواقي شمس، وقطعة ساترة لزيارة المساجد والمواقع التراثية.");
      en.push("👕 Light clothes, a hat and sunscreen, plus modest cover for mosques and heritage sites.");
    }
  }
  return { ar, en };
}

/* ------------------------------------------------------------ creating */

type Doc = AppNotification & { severity?: "warning" | "danger"; itemKeys?: string[] };

async function create(doc: Doc, emails: string[]): Promise<boolean> {
  if (!(await store().insert(COL, doc.id, doc))) return false;
  const sent = await notifyTravellers(emails, {
    subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`,
    text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n"),
  }, { bookingId: doc.bookingId || undefined });
  if (sent) await store().update<Doc>(COL, doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
  return true;
}

const base = (userId: string, id: string, kind: AppNotification["kind"], b: { id: string; reference: string } | null, now: Date) =>
  ({ id, userId, kind, bookingId: b?.id ?? "", reference: b?.reference ?? "", createdAt: now.toISOString(), readAt: null, deletedAt: null, email: null });

async function weatherAlert(b: StoredBooking, today: string, emails: string[], now: Date) {
  const id = `weather:${b.id}:${today}`;
  if (await store().get(COL, id)) return;
  const city = cityOn(b, today);
  const c = CITY_CENTERS[city];
  const w = c ? (await forecast(c.lat, c.lng))?.find((d) => d.date === today) : null;
  if (!w) return;
  const hz = hazardsOf(w);
  if (!hz.length) return;
  const plan = await planForBooking(b.userId, b.id);
  const outdoor = (plan?.days.find((d) => d.date === today)?.items ?? []).filter((i) => i.kind === "place" && OUTDOOR.has(i.category));
  const danger = hz.some((h) => h.severity === "danger");
  await create({
    ...base(b.userId, id, "weather", b, now), severity: danger ? "danger" : "warning",
    titleAr: `تنبيه طقس اليوم في ${cityName(city, "ar")}`, titleEn: `Weather alert today in ${cityName(city, "en")}`,
    linesAr: [...hz.map((h) => HAZARD[h.kind].ar(h.value)), ...hz.map((h) => HAZARD[h.kind].adviceAr), ...(outdoor.length ? [`📍 أنشطة خارجية في برنامجك اليوم: ${outdoor.map((i) => i.titleAr).join("، ")} — ننصح بنقلها إلى الصباح الباكر أو المساء أو يوم آخر.`] : [])],
    linesEn: [...hz.map((h) => HAZARD[h.kind].en(h.value)), ...hz.map((h) => HAZARD[h.kind].adviceEn), ...(outdoor.length ? [`📍 Outdoor activities in today's programme: ${outdoor.map((i) => i.titleEn).join(", ")} — consider moving them to the early morning, the evening or another day.`] : [])],
    href: plan ? `/planner/${plan.id}` : `/account/bookings/${b.id}`,
  }, emails);
}

async function dailyProgramme(b: StoredBooking, today: string, emails: string[], now: Date) {
  const id = `daily:${b.id}:${today}`;
  if (await store().get(COL, id)) return;
  const plan = await planForBooking(b.userId, b.id);
  const items = plan?.days.find((d) => d.date === today)?.items ?? [];
  const city = cityOn(b, today);
  const c = CITY_CENTERS[city];
  const w = c ? (await forecast(c.lat, c.lng))?.find((d) => d.date === today) : null;
  if (!items.length && !w) return;
  const item = (l: "ar" | "en") => (i: (typeof items)[number]) => `• ${l === "ar" ? i.titleAr : i.titleEn}${i.fixedStart ? ` (${i.fixedStart})` : ""}`;
  await create({
    ...base(b.userId, id, "daily", b, now),
    titleAr: `برنامج اليوم — ${day(today, "ar")}`, titleEn: `Today's programme — ${day(today, "en")}`,
    linesAr: [`📍 ${cityName(city, "ar")}`, ...(w ? [weatherLine(w, "ar")] : []), ...items.map(item("ar"))],
    linesEn: [`📍 ${cityName(city, "en")}`, ...(w ? [weatherLine(w, "en")] : []), ...items.map(item("en"))],
    href: plan ? `/planner/${plan.id}` : `/account/bookings/${b.id}`,
  }, emails);
}

const EVENT_INTEREST: Record<string, string[]> = {
  concert: ["entertainment"], theatre: ["entertainment", "culture"], sports: ["entertainment", "adventure"], family: ["entertainment"],
  culture: ["heritage", "culture"], dining: ["food"], adventure: ["adventure", "nature"],
};

async function eventSuggestions(b: StoredBooking, id: string, from: string, emails: string[], bookedIds: Set<string>, now: Date) {
  if (await store().get(COL, id)) return;
  const to = b.criteria.returnDate;
  const cities = new Set(b.criteria.stays.map((s) => s.city));
  const plan = await planForBooking(b.userId, b.id);
  const interests = plan?.request.interests ?? [];
  const seen = new Set(
    (await store().findBy<Doc>(COL, "userId", b.userId)).filter((n) => n.kind === "events").flatMap((n) => n.itemKeys ?? []),
  );
  const nowIso = now.toISOString();
  const picks = (await eventsCatalog({ from, to }))
    .filter((e) => cities.has(e.city) && !bookedIds.has(e.id) && !seen.has(e.id))
    .filter((e) => !interests.length || (EVENT_INTEREST[e.category] ?? []).some((i) => (interests as string[]).includes(i)))
    .map((e) => ({ e, s: e.sessions.find((s) => s.start > nowIso && ksaDate(new Date(s.start)) >= from && ksaDate(new Date(s.start)) <= to && cityOn(b, ksaDate(new Date(s.start))) === e.city) }))
    .filter((x): x is { e: typeof x.e; s: NonNullable<typeof x.s> } => !!x.s)
    .sort((a, c) => a.s.start.localeCompare(c.s.start))
    .slice(0, 3);
  if (!picks.length) return;
  const when = (iso: string, l: "ar" | "en") => fmtKsa(iso, l, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  await create({
    ...base(b.userId, id, "events", b, now), itemKeys: picks.map((p) => p.e.id),
    titleAr: "فعاليات تناسبك خلال رحلتك", titleEn: "Events for you during your trip",
    linesAr: picks.map(({ e, s }) => `🎟️ ${e.titleAr} — ${cityName(e.city, "ar")}، ${when(s.start, "ar")}`),
    linesEn: picks.map(({ e, s }) => `🎟️ ${e.titleEn} — ${cityName(e.city, "en")}, ${when(s.start, "en")}`),
    href: picks.length === 1 ? `/events/${picks[0].e.id}` : `/events?city=${picks[0].e.city}`,
  }, emails);
}

/** Booked events: a reminder 2 hours before, and a notice if the session was changed or cancelled. */
async function bookedEventAlerts(userId: string, email: string, now: Date) {
  for (const o of await listOrders(userId)) {
    if (o.status !== "CONFIRMED" || o.session.start <= now.toISOString()) continue;
    const start = Date.parse(o.session.start);
    const current = await getEventForSession(o.event.id, o.session.id);
    const exists = !!current?.sessions.some((s) => s.id === o.session.id && s.start === o.session.start);
    if (!exists) {
      await create({
        ...base(userId, `eventchg:${o.id}:${o.session.id}`, "eventChange", null, now), severity: "danger", reference: o.reference,
        titleAr: `تغيّر موعد فعاليتك أو أُلغي — ${o.event.titleAr}`, titleEn: `Your event was rescheduled or cancelled — ${o.event.titleEn}`,
        linesAr: [`الموعد المحجوز: ${fmtKsa(o.session.start, "ar", { dateStyle: "full", timeStyle: "short" })}.`, "لم يعد هذا الموعد متاحًا لدى المنظّم. افتح التذكرة للاطلاع على الخيارات أو تواصل مع الدعم لإعادة المبلغ أو تغيير الموعد."],
        linesEn: [`Booked session: ${fmtKsa(o.session.start, "en", { dateStyle: "full", timeStyle: "short" })}.`, "The organiser no longer lists this session. Open the ticket for your options, or contact support for a refund or a new time."],
        href: `/account/tickets/${o.id}`,
      }, [email]);
      continue;
    }
    if (now.getTime() >= start - 2 * 3600_000) {
      await create({
        ...base(userId, `event2h:${o.id}`, "eventReminder", null, now), reference: o.reference,
        titleAr: `فعاليتك بعد ساعتين — ${o.event.titleAr}`, titleEn: `Your event is in 2 hours — ${o.event.titleEn}`,
        linesAr: [`🕒 ${fmtKsa(o.session.start, "ar", { hour: "2-digit", minute: "2-digit" })} — ${o.event.venueAr}`, "ننصح بالوصول قبل الموعد بـ 30 إلى 45 دقيقة، واعرض رمز الدخول من «حجوزاتي».", `🧭 https://www.google.com/maps/dir/?api=1&destination=${o.event.lat},${o.event.lng}`],
        linesEn: [`🕒 ${fmtKsa(o.session.start, "en", { hour: "2-digit", minute: "2-digit" })} — ${o.event.venueEn}`, "Arrive 30–45 minutes early and show the entry code from My bookings.", `🧭 https://www.google.com/maps/dir/?api=1&destination=${o.event.lat},${o.event.lng}`],
        href: `/account/tickets/${o.id}`,
      }, [email]);
    }
  }
}

/** Creates the traveller's due trip alerts. */
export async function runTripAlerts(userId: string, now = new Date()): Promise<void> {
  const user = await getUserById(userId);
  if (!user) return;
  const prefs = await getAlertPrefs(userId);
  const today = ksaDate(now);
  const booked = new Set((await listOrders(userId)).filter((o) => o.status === "CONFIRMED").map((o) => o.event.id));
  for (const b of await listBookingsByUser(userId)) {
    if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED") continue;
    const { departureDate: dep, returnDate: ret } = b.criteria;
    const emails = [user.email];
    if (today >= dep && today <= ret) {
      await weatherAlert(b, today, emails, now);
      if (prefs.dailyProgramme && ksaHour(now) >= 5) await dailyProgramme(b, today, emails, now);
      const dayIndex = Math.round((Date.parse(today) - Date.parse(dep)) / 86_400_000);
      if (prefs.eventSuggestions && dayIndex % 2 === 0 && today < ret) await eventSuggestions(b, `events:${b.id}:${today}`, today, emails, booked, now);
    } else if (prefs.eventSuggestions && today >= addDays(dep, -7) && today < dep) {
      await eventSuggestions(b, `events:${b.id}:pre`, dep, emails, booked, now);
    }
  }
  await bookedEventAlerts(userId, user.email, now);
}

/** Today's weather alert for the traveller's trip (the banner at the top of the app). */
export async function weatherBanner(userId: string, now = new Date()): Promise<Doc | null> {
  const today = ksaDate(now);
  const rows = await store().findBy<Doc>(COL, "userId", userId);
  return (
    rows.find((n) => n.kind === "weather" && !n.deletedAt && n.id.endsWith(`:${today}`)) ??
    rows.find((n) => n.kind === "weather" && !n.deletedAt && n.demo) ??
    null
  );
}
