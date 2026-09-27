/**
 * Digital tourist card: one card per traveller with an issued visa in the account's bookings (the
 * account holder sees the whole family's). A signed QR code proves the card: it rotates every
 * minute online (so a photo of it can't be reused), and a 12-hour code is kept for offline use.
 * Scanning opens a public check page with the result, name, photo and nationality only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { StoredBooking } from "../bookings/types";
import { mtConfig } from "../config";
import { stayDates } from "../itinerary";
import { listBookingsByUser } from "../repo";
import { passportKey } from "../saved-travellers-repo";
import { secretFor } from "../secrets";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getUserById } from "../repo";
import { store } from "../store";

export const ROTATE_SECONDS = 60;
export const OFFLINE_HOURS = 12;

export interface TouristCard {
  id: string;
  userId: string;
  nameEn: string;
  nationality: string;
  passportLast4: string;
  visaNumber: string;
  visaType: string;
  visaIssueDate: string | null;
  visaExpiryDate: string;
  valid: boolean;
  insurance: "ISSUED" | "PENDING";
  trip: { reference: string; city: string | null; hotelAr: string | null; hotelEn: string | null; returnDate: string } | null;
  demo?: boolean;
}

const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

function tripNow(b: StoredBooking, today: string): TouristCard["trip"] {
  if (today > b.criteria.returnDate) return null;
  const stays = stayDates(b.criteria);
  const inTrip = today >= b.criteria.departureDate;
  const stay = inTrip ? stays.find((s) => today >= s.checkIn && today < s.checkOut) ?? stays[stays.length - 1] : stays[0];
  const hotel = b.hotels.find((h) => h.city === stay.city && h.checkIn <= (inTrip ? today : stay.checkIn) && h.checkOut > (inTrip ? today : stay.checkIn)) ?? null;
  return { reference: b.reference, city: stay.city, hotelAr: hotel?.nameAr ?? null, hotelEn: hotel?.nameEn ?? null, returnDate: b.criteria.returnDate };
}

/** A sample card (sandbox) so the service can be seen without an issued visa. */
function demoCard(userId: string, now: Date): TouristCard {
  const today = ksaToday(now);
  const plus = (d: number) => new Date(Date.parse(`${today}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  return {
    id: `demo-${userId}`, userId, nameEn: "AHMED ALI", nationality: "EG", passportLast4: "4567", visaNumber: "6000000001", visaType: "tourism-package",
    visaIssueDate: plus(-10), visaExpiryDate: plus(355), valid: true, insurance: "ISSUED",
    trip: { reference: "TA-DEMO2026", city: "RUH", hotelAr: "فندق نجد الكبير", hotelEn: "Najd Grand Hotel", returnDate: plus(5) }, demo: true,
  };
}

export const demoCardsEnabled = () => mtConfig().mock && process.env.DEMO_CARD !== "off";

/** The cards of the account (issued visas), newest trip first. */
export async function listCards(userId: string, now = new Date()): Promise<TouristCard[]> {
  const today = ksaToday(now);
  const cards = new Map<string, TouristCard>();
  const bookings = (await listBookingsByUser(userId))
    .filter((b) => b.status !== "CANCELLED" && b.mt.packageStatus !== "CANCELLED")
    .sort((a, b) => b.criteria.departureDate.localeCompare(a.criteria.departureDate));
  for (const b of bookings) {
    for (const a of b.applicants) {
      if (!a.visaNumber || !a.visaExpiryDate) continue;
      const key = passportKey(a);
      if (cards.has(key)) continue;
      cards.set(key, {
        id: `${b.id}:${a.applicationNo}`, userId, nameEn: a.nameEn, nationality: a.nationality, passportLast4: a.passportNo.slice(-4),
        visaNumber: a.visaNumber, visaType: "tourism-package", visaIssueDate: a.visaIssueDate, visaExpiryDate: a.visaExpiryDate,
        valid: a.visaStatus !== "CANCELLED" && a.visaExpiryDate >= today, insurance: a.insuranceStatus === "ISSUED" ? "ISSUED" : "PENDING",
        trip: tripNow(b, today),
      });
    }
  }
  const list = [...cards.values()];
  if (!list.length && demoCardsEnabled()) list.push(demoCard(userId, now));
  return list;
}

export async function getCard(userId: string, id: string, now = new Date()): Promise<TouristCard | null> {
  return (await listCards(userId, now)).find((c) => c.id === id) ?? null;
}

/* ------------------------------------------------------------------ QR tokens */

const sign = (payload: string) => createHmac("sha256", `card:${secretFor("session")}`).update(payload).digest("base64url").slice(0, 32);

/** A signed token for the card: `u.c.exp.sig` (base64url parts). */
export function cardToken(card: Pick<TouristCard, "id" | "userId">, now = new Date(), ttlSeconds = ROTATE_SECONDS): { token: string; expiresAt: string } {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${Buffer.from(card.userId).toString("base64url")}.${Buffer.from(card.id).toString("base64url")}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type Verification =
  | { result: "valid" | "invalidVisa"; card: Pick<TouristCard, "nameEn" | "nationality" | "visaExpiryDate" | "valid" | "demo">; photo: boolean; checkedAt: string }
  | { result: "expiredCode" | "invalid" };

function parse(token: string): { userId: string; cardId: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [u, c, e, sig] = parts;
  const expected = sign(`${u}.${c}.${e}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const exp = Number(e);
  if (!Number.isInteger(exp)) return null;
  return { userId: Buffer.from(u, "base64url").toString(), cardId: Buffer.from(c, "base64url").toString(), exp };
}

/** Public check of a scanned code. */
export async function verifyCardToken(token: string, now = new Date()): Promise<Verification & { personKey?: string; userId?: string }> {
  const p = parse(token);
  if (!p) return { result: "invalid" };
  if (p.exp * 1000 < now.getTime()) return { result: "expiredCode" };
  const card = await getCard(p.userId, p.cardId, now);
  if (!card) return { result: "invalid" };
  return {
    result: card.valid ? "valid" : "invalidVisa",
    card: { nameEn: card.nameEn, nationality: card.nationality, visaExpiryDate: card.visaExpiryDate, valid: card.valid, ...(card.demo ? { demo: true } : {}) },
    photo: !card.demo, checkedAt: now.toISOString(), userId: card.userId, ...(card.demo ? {} : { personKey: await personKeyOf(card) }),
  };
}

/** The wallet person of a card (server only: it holds the passport number). */
async function personKeyOf(card: Pick<TouristCard, "id" | "userId">): Promise<string | undefined> {
  const [bookingId, applicationNo] = card.id.split(":");
  const b = (await listBookingsByUser(card.userId)).find((x) => x.id === bookingId);
  const a = b?.applicants.find((x) => x.applicationNo === applicationNo);
  return a ? passportKey(a) : undefined;
}

/** «Your digital card is ready» once per card, when its visa is issued (in the app and by email). */
export async function cardReadyNotifications(userId: string, now = new Date()): Promise<void> {
  const cards = (await listCards(userId, now)).filter((c) => !c.demo && c.valid);
  if (!cards.length) return;
  const user = await getUserById(userId);
  for (const c of cards) {
    const id = `card:${c.id}`;
    const doc: AppNotification = {
      id, userId, kind: "card", bookingId: c.id.split(":")[0], reference: c.trip?.reference ?? "", createdAt: now.toISOString(),
      titleAr: `البطاقة الرقمية جاهزة — ${c.nameEn}`, titleEn: `Digital tourist card ready — ${c.nameEn}`,
      linesAr: ["صدرت التأشيرة وأصبحت البطاقة الرقمية للسائح متاحة. اعرض رمز التحقق (QR) عند الطلب في الفنادق والفعاليات بدل الجواز، وتعمل دون إنترنت."],
      linesEn: ["The visa is issued and the digital tourist card is ready. Show its verification code (QR) at hotels and events instead of your passport; it also works offline."],
      href: "/account/card", readAt: null, deletedAt: null, email: null,
    };
    if (!(await store().insert("notifications", id, doc))) continue;
    if (user) await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") });
  }
}
