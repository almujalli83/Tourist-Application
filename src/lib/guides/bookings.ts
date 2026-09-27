/**
 * Guide requests: the traveller asks a licensed guide for a date, time, duration, group size and
 * language (no payment for now). The guide confirms or declines from the link in the email; the
 * traveller is told in the app and by email. If the guide's licence expires, pending and upcoming
 * requests are cancelled and the traveller notified.
 */
import { randomBytes } from "node:crypto";
import { displayName, type PublicUser } from "../auth/types";
import { mtConfig } from "../config";
import { cityName } from "../data/cities";
import { isValidISODate } from "../dates";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { store } from "../store";
import { ensureDemo, isLicensed, ksaToday, type StoredGuide } from "./guides";
import { GUIDE_LANGUAGES } from "./types";

const COL = "guideBookings" as const;
export const GUIDE_BOOKING_STATUSES = ["pending", "confirmed", "declined", "cancelled"] as const;
export type GuideBookingStatus = (typeof GUIDE_BOOKING_STATUSES)[number];
export type CancelReason = "traveller" | "licenseExpired";

export interface GuideBooking {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  guide: { licenseNo: string; nameAr: string; nameEn: string; phone: string; email: string | null; demo?: boolean };
  city: string;
  date: string;
  startTime: string;
  hours: number;
  people: number;
  language: string;
  notes: string;
  status: GuideBookingStatus;
  cancelReason: CancelReason | null;
  guideNote: string | null;
  /** Where to meet, set by the guide when confirming (coordinates when a map link was given). */
  meetingPoint?: { text: string; lat: number | null; lng: number | null } | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
}
type Stored = GuideBooking & { token: string };

export interface GuideRequestInput {
  licenseNo: string;
  city: string;
  date: string;
  startTime: string;
  hours: number;
  people: number;
  language: string;
  notes?: string;
  phone?: string;
}

export class GuideBookingError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

const strip = ({ token: _t, ...b }: Stored): GuideBooking => b; // eslint-disable-line @typescript-eslint/no-unused-vars
const langName = (code: string, i: 0 | 1) => GUIDE_LANGUAGES[code]?.[i] ?? code;

export async function requestGuide(user: PublicUser, input: GuideRequestInput, origin: string, now = new Date()): Promise<GuideBooking & { respondUrl?: string }> {
  await ensureDemo();
  const g = await store().get<StoredGuide>("guides", String(input.licenseNo ?? ""));
  const today = ksaToday(now);
  if (!g || !isLicensed(g, today)) throw new GuideBookingError("guideUnavailable", 404);
  if (!isValidISODate(input.date) || input.date < today || input.date > g.licenseExpiry) throw new GuideBookingError("invalidDate");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime ?? "")) throw new GuideBookingError("invalidTime");
  const hours = Math.round(Number(input.hours));
  const people = Math.round(Number(input.people));
  if (!(hours >= 1 && hours <= 10)) throw new GuideBookingError("invalidHours");
  if (!(people >= 1 && people <= 30)) throw new GuideBookingError("invalidPeople");
  if (!g.cities.includes(input.city)) throw new GuideBookingError("invalidCity");
  if (!g.languages.some((l) => l.code === input.language)) throw new GuideBookingError("invalidLanguage");
  const mine = await store().findBy<Stored>(COL, "userId", user.id);
  if (mine.some((b) => b.guide.licenseNo === g.licenseNo && b.date === input.date && (b.status === "pending" || b.status === "confirmed"))) throw new GuideBookingError("duplicate", 409);
  if (mine.filter((b) => b.status === "pending").length >= 10) throw new GuideBookingError("tooMany", 429);

  const at = now.toISOString();
  const b: Stored = {
    id: randomBytes(12).toString("hex"), reference: `GD-${randomBytes(3).toString("hex").toUpperCase()}`,
    userId: user.id, userName: displayName(user), userEmail: user.email,
    userPhone: (input.phone ?? user.individual?.phone ?? user.company?.phone ?? "").replace(/[^\d+]/g, "") || null,
    guide: { licenseNo: g.licenseNo, nameAr: g.nameAr, nameEn: g.nameEn, phone: g.phone, email: g.email, ...(g.demo ? { demo: true } : {}) },
    city: input.city, date: input.date, startTime: input.startTime, hours, people, language: input.language,
    notes: String(input.notes ?? "").trim().slice(0, 500),
    status: "pending", cancelReason: null, guideNote: null, createdAt: at, updatedAt: at, respondedAt: null,
    token: randomBytes(24).toString("base64url"),
  };
  await store().put(COL, b.id, b);
  const respondUrl = `${origin}/ar/guides/respond/${b.token}`;
  if (g.email) {
    await notifyTravellers([g.email], {
      subject: `طلب إرشاد سياحي ${b.reference} — Tour guide request`,
      text: [
        `مرحبًا ${g.nameAr}،`, `وصلك طلب إرشاد سياحي عبر سعودي تريب:`,
        `التاريخ: ${b.date} الساعة ${b.startTime} لمدة ${hours} ساعات`, `المدينة: ${cityName(b.city, "ar")} · عدد الأشخاص: ${people} · اللغة: ${langName(b.language, 0)}`,
        `المسافر: ${b.userName}${b.userPhone ? ` · ${b.userPhone}` : ""}`, ...(b.notes ? [`ملاحظات: ${b.notes}`] : []),
        "", `للتأكيد أو الاعتذار: ${respondUrl}`, "",
        `Hello ${g.nameEn}, you have a tour request ${b.reference} on ${b.date} at ${b.startTime} for ${hours}h in ${cityName(b.city, "en")}, ${people} people, in ${langName(b.language, 1)}.`,
        `Confirm or decline: ${respondUrl.replace("/ar/", "/en/")}`,
      ].join("\n"),
    });
  }
  // Sandbox: the traveller can play the guide's part to see the whole flow.
  return { ...strip(b), ...(mtConfig().mock ? { respondUrl } : {}) };
}

async function tellTraveller(b: GuideBooking, kind: "confirmed" | "declined" | "licenseExpired", now: Date) {
  const who = { ar: b.guide.nameAr, en: b.guide.nameEn };
  const txt = {
    confirmed: [`أكّد المرشد ${who.ar} طلبك`, `${who.en} confirmed your tour`, "يمكنك التواصل معه مباشرة عبر الاتصال أو واتساب.", "You can contact the guide directly by phone or WhatsApp."],
    declined: [`اعتذر المرشد ${who.ar} عن طلبك`, `${who.en} declined your tour request`, "يمكنك اختيار مرشد آخر من دليل المرشدين.", "You can choose another guide from the directory."],
    licenseExpired: [`أُلغي طلب المرشد ${who.ar}`, `Tour request with ${who.en} cancelled`, "انتهى ترخيص المرشد لدى وزارة السياحة، لذا أُلغي الطلب. اختر مرشدًا مرخّصًا آخر من الدليل.", "The guide's Ministry of Tourism licence has expired, so the request was cancelled. Please choose another licensed guide."],
  }[kind];
  const meet = b.meetingPoint?.text ? ` · 📍 ${b.meetingPoint.text}` : "";
  const lineAr = `${b.reference} · ${b.date} ${b.startTime}${meet}${b.guideNote ? ` · ${b.guideNote}` : ""}`;
  const lineEn = `${b.reference} · ${b.date} ${b.startTime}${meet}${b.guideNote ? ` · ${b.guideNote}` : ""}`;
  const id = `guide:${b.id}:${kind}`;
  const doc: AppNotification = {
    id, userId: b.userId, kind: "guide", bookingId: b.id, reference: b.reference, createdAt: now.toISOString(),
    titleAr: txt[0], titleEn: txt[1], linesAr: [txt[2], lineAr], linesEn: [txt[3], lineEn],
    href: `/account/guide-bookings/${b.id}`, readAt: null, deletedAt: null, email: null,
    ...(kind !== "confirmed" ? { severity: "warning" as const } : {}),
  };
  if (!(await store().insert("notifications", id, doc))) return;
  const sent = await notifyTravellers([b.userEmail], { subject: `Saudi Trip — ${txt[1]} / ${txt[0]}`, text: [txt[1], txt[3], lineEn, "", txt[0], txt[2], lineAr].join("\n") });
  if (sent) await store().update<AppNotification>("notifications", id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
}

/** The request as seen by the guide (from the emailed link). */
export async function requestByToken(token: string): Promise<GuideBooking | null> {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const [b] = await store().findBy<Stored>(COL, "token", token);
  return b ? strip(b) : null;
}

/** Coordinates from a map link or "lat,lng" text (Google Maps @lat,lng / q= / ll=, Apple Maps ll=). */
export function parseCoords(input: string | null | undefined): { lat: number; lng: number } | null {
  let s = String(input ?? "").trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as typed */
  }
  const m = s.match(/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    ?? s.match(/[?&](?:q|query|ll|daddr|destination)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
    ?? s.match(/^(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export async function respondToRequest(token: string, action: "confirm" | "decline", note: string | null, now = new Date(), meeting?: { text?: string | null; link?: string | null }): Promise<GuideBooking> {
  await expireGuideRequests(now);
  const [found] = /^[\w-]{20,64}$/.test(token) ? await store().findBy<Stored>(COL, "token", token) : [];
  if (!found) throw new GuideBookingError("notFound", 404);
  if (found.status !== "pending") throw new GuideBookingError("alreadyAnswered", 409);
  const status: GuideBookingStatus = action === "confirm" ? "confirmed" : "declined";
  const b = (await store().update<Stored>(COL, found.id, (x) => (x.status === "pending"
    ? {
        ...x, status, guideNote: note?.trim().slice(0, 300) || null, respondedAt: now.toISOString(), updatedAt: now.toISOString(),
        meetingPoint: status === "confirmed" && (meeting?.text?.trim() || parseCoords(meeting?.link))
          ? { text: (meeting?.text ?? "").trim().slice(0, 200), lat: parseCoords(meeting?.link)?.lat ?? null, lng: parseCoords(meeting?.link)?.lng ?? null }
          : null,
      }
    : x)))!;
  if (b.status !== status) throw new GuideBookingError("alreadyAnswered", 409);
  await tellTraveller(b, status === "confirmed" ? "confirmed" : "declined", now);
  return strip(b);
}

export async function cancelGuideRequest(userId: string, id: string, now = new Date()): Promise<GuideBooking> {
  const b = await store().get<Stored>(COL, id);
  if (!b || b.userId !== userId) throw new GuideBookingError("notFound", 404);
  if (b.status !== "pending" && b.status !== "confirmed") throw new GuideBookingError("notCancellable", 409);
  const out = (await store().update<Stored>(COL, id, (x) => ({ ...x, status: "cancelled", cancelReason: "traveller", updatedAt: now.toISOString() })))!;
  if (b.guide.email) {
    await notifyTravellers([b.guide.email], {
      subject: `إلغاء طلب ${b.reference} — Request cancelled`,
      text: `ألغى المسافر ${b.userName} طلب الإرشاد ${b.reference} (${b.date} ${b.startTime}).\nThe traveller cancelled tour request ${b.reference} (${b.date} ${b.startTime}).`,
    });
  }
  return strip(out);
}

/** Cancels pending and upcoming requests of guides whose licence is no longer valid. */
export async function expireGuideRequests(now = new Date(), onlyUser?: string): Promise<number> {
  const today = ksaToday(now);
  const rows = onlyUser ? await store().findBy<Stored>(COL, "userId", onlyUser) : await store().list<Stored>(COL, 100_000);
  const guides = new Map<string, StoredGuide | null>();
  let n = 0;
  for (const b of rows) {
    if (!(b.status === "pending" || (b.status === "confirmed" && b.date >= today))) continue;
    if (!guides.has(b.guide.licenseNo)) guides.set(b.guide.licenseNo, await store().get<StoredGuide>("guides", b.guide.licenseNo));
    const g = guides.get(b.guide.licenseNo);
    if (g && isLicensed(g, today) && b.date <= g.licenseExpiry) continue;
    const out = await store().update<Stored>(COL, b.id, (x) => ({ ...x, status: "cancelled", cancelReason: "licenseExpired", updatedAt: now.toISOString() }));
    if (out) await tellTraveller(out, "licenseExpired", now);
    n++;
  }
  return n;
}

export async function listGuideBookings(userId: string, now = new Date()): Promise<GuideBooking[]> {
  await expireGuideRequests(now, userId);
  return (await store().findBy<Stored>(COL, "userId", userId)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getGuideBooking(userId: string, id: string, now = new Date()): Promise<(GuideBooking & { respondUrl?: string }) | null> {
  await expireGuideRequests(now, userId);
  const b = await store().get<Stored>(COL, id);
  if (!b || b.userId !== userId) return null;
  return { ...strip(b), ...(mtConfig().mock && b.status === "pending" ? { respondUrl: `/guides/respond/${b.token}` } : {}) };
}

/** Confirmed tours (for verified guide reviews, ratable once the tour has ended). */
export async function confirmedGuideTours(userId: string): Promise<GuideBooking[]> {
  return (await store().findBy<Stored>(COL, "userId", userId)).filter((b) => b.status === "confirmed").map(strip);
}

/** Back office: all requests. */
export async function adminGuideBookings(limit = 500): Promise<GuideBooking[]> {
  return (await store().list<Stored>(COL, limit)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

