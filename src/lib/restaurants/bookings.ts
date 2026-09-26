/**
 * Restaurant table bookings (any signed-in account). Free bookings, or a fee per guest charged
 * now and deducted from the bill at the restaurant, per the provider's policy. Covers are held
 * atomically per restaurant and day. Changes (date, time, party size) and cancellation are allowed
 * until the restaurant's cut-offs; a cancelled booking's fee is refunded in full.
 */
import { createHash, randomBytes } from "node:crypto";
import { displayName, type PublicUser } from "../auth/types";
import { isValidISODate, todayISO } from "../dates";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import { store } from "../store";
import {
  BOOKING_DAYS_AHEAD, getRestaurant, MIN_NOTICE_MINUTES, providerBookedCovers, providerCancel, providerChange, providerReserve, seatingTimes, slotInstant,
  type Restaurant, type RestaurantPolicy,
} from "./catalog";

export interface Slot { day: string; time: string; party: number }

export interface RestaurantBooking {
  id: string;
  reference: string;
  code: string;
  providerRef: string;
  userId: string;
  idempotencyKey: string;
  createdAt: string;
  status: "CONFIRMED" | "CANCELLED";
  restaurant: Pick<Restaurant, "id" | "provider" | "city" | "nameAr" | "nameEn" | "addressAr" | "addressEn" | "lat" | "lng" | "cuisine"> & { policy: RestaurantPolicy };
  day: string;
  time: string;
  start: string;
  party: number;
  guestName: string;
  guestEmail: string;
  fee: { perGuestSAR: number; paidSAR: number; payment: { transactionId: string; method: string; last4: string } | null };
  changes: { at: string; from: Slot; to: Slot; chargedSAR: number; refundedSAR: number }[];
  cancellation: { at: string; refundSAR: number } | null;
}

export class RestaurantBookingError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------------------------------------------------------- covers */

interface DayCovers {
  id: string;
  /** Covers booked here per time. */
  covers: Record<string, number>;
  /** Booking id → its slot (so holds are released exactly once). */
  holds: Record<string, { time: string; party: number }>;
  /** Temporary holds before payment (e.g. a plan's table): booking id → slot and expiry. */
  temp?: Record<string, { time: string; party: number; until: number }>;
}

/** Covers of unexpired temporary holds at a time, other than `except`. */
const tempCovers = (doc: DayCovers, time: string, now: number, except?: string) =>
  Object.entries(doc.temp ?? {}).reduce((a, [id, h]) => a + (id !== except && h.until > now && h.time === time ? h.party : 0), 0);
/** Booking id of a user's booking with this idempotency key (also the id of its temporary hold). */
export const bookingIdFor = (userId: string, key: string) => createHash("sha256").update(`${userId}|table|${key}`).digest("hex").slice(0, 24);

const dayDocId = (rid: string, day: string) => `${rid}:${day}`;

async function dayDoc(rid: string, day: string): Promise<DayCovers> {
  const id = dayDocId(rid, day);
  const s = store();
  const doc = await s.get<DayCovers>("restaurantSlots", id);
  if (doc) return doc;
  await s.insert<DayCovers>("restaurantSlots", id, { id, covers: {}, holds: {} });
  return (await s.get<DayCovers>("restaurantSlots", id)) ?? { id, covers: {}, holds: {} };
}

export interface SlotAvailability { time: string; left: number; bookable: boolean }

/** Seating times of a day with the covers left; `bookable` also checks the booking notice. */
export async function availability(r: Restaurant, day: string, now = new Date(), except?: string): Promise<SlotAvailability[]> {
  if (!isValidISODate(day)) return [];
  const doc = await dayDoc(r.id, day);
  const limit = now.getTime() + MIN_NOTICE_MINUTES * 60_000;
  return seatingTimes(r, day).map((time) => {
    const left = Math.max(0, r.coversPerSlot - providerBookedCovers(r, day, time) - (doc.covers[time] ?? 0) - tempCovers(doc, time, now.getTime(), except));
    return { time, left, bookable: left > 0 && Date.parse(slotInstant(day, time)) > limit };
  });
}

/** Holds `slot` for the booking, releasing `previous` in the same step when it is on the same day. */
async function hold(r: Restaurant, slot: Slot, bookingId: string, previous?: Slot, temporaryUntil?: number): Promise<boolean> {
  await dayDoc(r.id, slot.day);
  let ok = true;
  const now = Date.now();
  await store().update<DayCovers>("restaurantSlots", dayDocId(r.id, slot.day), (doc) => {
    const temp = Object.fromEntries(Object.entries(doc.temp ?? {}).filter(([id, h]) => id !== bookingId && h.until > now));
    const othersTemp = tempCovers(doc, slot.time, now, bookingId);
    // A temporary hold only reserves the covers until it expires (or the booking takes it over).
    if (temporaryUntil) {
      if (providerBookedCovers(r, slot.day, slot.time) + (doc.covers[slot.time] ?? 0) + othersTemp + slot.party > r.coversPerSlot) {
        ok = false;
        return doc;
      }
      return { ...doc, temp: { ...temp, [bookingId]: { time: slot.time, party: slot.party, until: temporaryUntil } } };
    }
    const covers = { ...doc.covers };
    const holds = { ...doc.holds };
    const prev = holds[bookingId];
    if (prev && previous?.day === slot.day) covers[prev.time] = Math.max(0, (covers[prev.time] ?? 0) - prev.party);
    if (providerBookedCovers(r, slot.day, slot.time) + (covers[slot.time] ?? 0) + othersTemp + slot.party > r.coversPerSlot) {
      ok = false;
      return doc;
    }
    covers[slot.time] = (covers[slot.time] ?? 0) + slot.party;
    holds[bookingId] = { time: slot.time, party: slot.party };
    return { ...doc, covers, holds, temp };
  });
  return ok;
}

async function release(rid: string, day: string, bookingId: string) {
  await store().update<DayCovers>("restaurantSlots", dayDocId(rid, day), (doc) => {
    const h = doc.holds[bookingId];
    if (!h) return doc;
    const holds = { ...doc.holds };
    delete holds[bookingId];
    return { ...doc, holds, covers: { ...doc.covers, [h.time]: Math.max(0, (doc.covers[h.time] ?? 0) - h.party) } };
  });
}

/* ---------------------------------------------------------- validation */

function checkSlot(r: Restaurant, slot: Slot, now: Date) {
  const today = todayISO();
  if (!isValidISODate(slot.day) || slot.day < today || slot.day > addDays(today, BOOKING_DAYS_AHEAD)) throw new RestaurantBookingError("invalidDate");
  if (!Number.isInteger(slot.party) || slot.party < 1 || slot.party > r.maxParty) throw new RestaurantBookingError("invalidParty");
  if (!seatingTimes(r, slot.day).includes(slot.time)) throw new RestaurantBookingError("invalidTime");
  if (Date.parse(slotInstant(slot.day, slot.time)) - now.getTime() < MIN_NOTICE_MINUTES * 60_000) throw new RestaurantBookingError("tooLate");
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const feeFor = (r: Pick<Restaurant, "policy">, party: number) => round2(r.policy.feePerGuestSAR * party);

/* ---------------------------------------------------------- book */

export interface BookInput extends Slot {
  restaurantId: string;
  expectedFeeSAR: number;
  idempotencyKey: string;
  card?: CardInput;
}

export async function bookTable(user: PublicUser, input: BookInput, now = new Date()): Promise<RestaurantBooking> {
  if (!input.idempotencyKey || input.idempotencyKey.length > 100) throw new RestaurantBookingError("idempotencyKey", 400);
  const id = bookingIdFor(user.id, input.idempotencyKey);
  const existing = await store().get<RestaurantBooking>("restaurantBookings", id);
  if (existing) return existing;

  const r = getRestaurant(input.restaurantId);
  if (!r) throw new RestaurantBookingError("notFound", 404);
  const slot = { day: input.day, time: input.time, party: Number(input.party) };
  checkSlot(r, slot, now);
  const total = feeFor(r, slot.party);
  if (Math.abs(total - Number(input.expectedFeeSAR)) > 0.01) throw new RestaurantBookingError("priceChanged", 409);
  if (total > 0 && !input.card) throw new RestaurantBookingError("cardRequired");

  if (!(await hold(r, slot, id))) throw new RestaurantBookingError("slotFull", 409);
  let payment: RestaurantBooking["fee"]["payment"] = null;
  if (total > 0) {
    const pay = await chargeCard(input.card!, total, now);
    if (!pay.ok) {
      await release(r.id, slot.day, id);
      throw new RestaurantBookingError(`payment_${pay.code}`, 402);
    }
    payment = { transactionId: pay.transactionId, method: pay.method, last4: pay.last4 };
  }
  const issued = await providerReserve(r);
  const booking: RestaurantBooking = {
    id,
    reference: `RS-${randomBytes(4).toString("hex").toUpperCase()}`,
    code: issued.code,
    providerRef: issued.providerRef,
    userId: user.id,
    idempotencyKey: input.idempotencyKey,
    createdAt: now.toISOString(),
    status: "CONFIRMED",
    restaurant: { id: r.id, provider: r.provider, city: r.city, nameAr: r.nameAr, nameEn: r.nameEn, addressAr: r.addressAr, addressEn: r.addressEn, lat: r.lat, lng: r.lng, cuisine: r.cuisine, policy: r.policy },
    ...slot,
    start: slotInstant(slot.day, slot.time),
    guestName: displayName(user),
    guestEmail: user.email,
    fee: { perGuestSAR: r.policy.feePerGuestSAR, paidSAR: total, payment },
    changes: [],
    cancellation: null,
  };
  if (!(await store().insert("restaurantBookings", id, booking))) {
    if (payment) await refundPayment(payment.transactionId, total);
    return (await store().get<RestaurantBooking>("restaurantBookings", id))!;
  }
  await notifyTravellers([user.email], bookingEmail(booking, "confirmed", user.preferredLocale));
  return booking;
}

/** Holds a table for a while without booking it (the booking made later with the same key takes it over). */
export async function holdTable(user: PublicUser, input: Slot & { restaurantId: string; idempotencyKey: string }, minutes: number, now = new Date()): Promise<{ ok: boolean; until: number }> {
  const r = getRestaurant(input.restaurantId);
  if (!r) return { ok: false, until: 0 };
  const slot = { day: input.day, time: input.time, party: Number(input.party) };
  try {
    checkSlot(r, slot, now);
  } catch {
    return { ok: false, until: 0 };
  }
  const until = now.getTime() + minutes * 60_000;
  return { ok: await hold(r, slot, bookingIdFor(user.id, input.idempotencyKey), undefined, until), until };
}

/* ---------------------------------------------------------- read */

export async function listTableBookings(userId: string): Promise<RestaurantBooking[]> {
  return (await store().findBy<RestaurantBooking>("restaurantBookings", "userId", userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getTableBooking(userId: string, id: string): Promise<RestaurantBooking | null> {
  const b = await store().get<RestaurantBooking>("restaurantBookings", id);
  return b && b.userId === userId ? b : null;
}

const deadline = (b: RestaurantBooking, hours: number) => new Date(Date.parse(b.start) - hours * 3_600_000).toISOString();
export const cancelDeadline = (b: RestaurantBooking) => deadline(b, b.restaurant.policy.cancelCutoffHours);
export const changeDeadline = (b: RestaurantBooking) => deadline(b, b.restaurant.policy.changeCutoffHours);
export const canCancelTable = (b: RestaurantBooking, now = new Date()) => b.status === "CONFIRMED" && now.getTime() < Date.parse(cancelDeadline(b));
export const canChangeTable = (b: RestaurantBooking, now = new Date()) => b.status === "CONFIRMED" && now.getTime() < Date.parse(changeDeadline(b));

/* ---------------------------------------------------------- change */

/** Fee difference of a change: positive = to pay now, negative = refunded. */
export const changeDelta = (b: RestaurantBooking, party: number) => round2(b.fee.perGuestSAR * party - b.fee.paidSAR);

export async function changeTableBooking(user: PublicUser, id: string, to: Slot & { expectedDeltaSAR: number; card?: CardInput }, now = new Date()): Promise<RestaurantBooking> {
  const b = await getTableBooking(user.id, id);
  if (!b) throw new RestaurantBookingError("notFound", 404);
  if (!canChangeTable(b, now)) throw new RestaurantBookingError("notChangeable");
  const r = getRestaurant(b.restaurant.id);
  if (!r) throw new RestaurantBookingError("notFound", 404);
  const slot = { day: to.day, time: to.time, party: Number(to.party) };
  checkSlot(r, slot, now);
  if (slot.day === b.day && slot.time === b.time && slot.party === b.party) return b;
  const delta = changeDelta(b, slot.party);
  if (Math.abs(delta - Number(to.expectedDeltaSAR)) > 0.01) throw new RestaurantBookingError("priceChanged", 409);
  if (delta > 0 && !to.card) throw new RestaurantBookingError("cardRequired");

  const from: Slot = { day: b.day, time: b.time, party: b.party };
  if (!(await hold(r, slot, b.id, from))) throw new RestaurantBookingError("slotFull", 409);
  let charged = 0;
  let refunded = 0;
  let payment = b.fee.payment;
  if (delta > 0) {
    const pay = await chargeCard(to.card!, delta, now);
    if (!pay.ok) {
      // Put the booking back on its original slot (another day's hold was never released).
      if (slot.day !== from.day) await release(r.id, slot.day, b.id);
      else await hold(r, from, b.id, slot);
      throw new RestaurantBookingError(`payment_${pay.code}`, 402);
    }
    charged = delta;
    payment = payment ?? { transactionId: pay.transactionId, method: pay.method, last4: pay.last4 };
  } else if (delta < 0 && b.fee.payment) {
    const rf = await refundPayment(b.fee.payment.transactionId, -delta);
    if (rf.ok) refunded = -delta;
  }
  if (slot.day !== from.day) await release(r.id, from.day, b.id);
  await providerChange(b.providerRef);
  const done = await store().update<RestaurantBooking>("restaurantBookings", id, (cur) => ({
    ...cur,
    ...slot,
    start: slotInstant(slot.day, slot.time),
    fee: { ...cur.fee, paidSAR: round2(cur.fee.paidSAR + charged - refunded), payment },
    changes: [...cur.changes, { at: now.toISOString(), from, to: slot, chargedSAR: charged, refundedSAR: refunded }],
  }));
  await notifyTravellers([b.guestEmail], bookingEmail(done!, "changed", user.preferredLocale));
  return done!;
}

/* ---------------------------------------------------------- cancel */

export async function cancelTableBooking(user: PublicUser, id: string, now = new Date()): Promise<RestaurantBooking> {
  const b = await getTableBooking(user.id, id);
  if (!b) throw new RestaurantBookingError("notFound", 404);
  if (!canCancelTable(b, now)) throw new RestaurantBookingError("notCancellable");
  let claimed = false;
  await store().update<RestaurantBooking>("restaurantBookings", id, (cur) => {
    if (cur.status !== "CONFIRMED") return cur;
    claimed = true;
    return { ...cur, status: "CANCELLED", cancellation: { at: now.toISOString(), refundSAR: cur.fee.paidSAR } };
  });
  if (!claimed) throw new RestaurantBookingError("notCancellable");
  if (b.fee.paidSAR > 0 && b.fee.payment) await refundPayment(b.fee.payment.transactionId, b.fee.paidSAR);
  await providerCancel(b.providerRef);
  await release(b.restaurant.id, b.day, b.id);
  const done = (await getTableBooking(user.id, id))!;
  await notifyTravellers([b.guestEmail], bookingEmail(done, "cancelled", user.preferredLocale));
  return done;
}

/* ---------------------------------------------------------- email */

function bookingEmail(b: RestaurantBooking, kind: "confirmed" | "changed" | "cancelled", locale: "ar" | "en") {
  const ar = locale === "ar";
  const name = ar ? b.restaurant.nameAr : b.restaurant.nameEn;
  const when = new Date(b.start).toLocaleString(ar ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "full", timeStyle: "short" });
  const fee = b.fee.paidSAR > 0
    ? (ar ? `\nرسوم الحجز المدفوعة ${b.fee.paidSAR} ريال تُخصم من قيمة الفاتورة في المطعم.` : `\nThe booking fee paid (SAR ${b.fee.paidSAR}) is deducted from your bill at the restaurant.`)
    : "";
  if (kind === "cancelled") {
    const refund = b.cancellation?.refundSAR ?? 0;
    return ar
      ? { subject: `إلغاء حجز ${name} — ${b.reference}`, text: `تم إلغاء حجزك ${b.reference} في ${name} (${when}).${refund > 0 ? `\nسيُعاد ${refund} ريال إلى بطاقتك.` : ""}` }
      : { subject: `Booking cancelled: ${name} — ${b.reference}`, text: `Your booking ${b.reference} at ${name} (${when}) has been cancelled.${refund > 0 ? `\nSAR ${refund} will be refunded to your card.` : ""}` };
  }
  const head = kind === "changed" ? (ar ? "تم تعديل حجزك" : "Your booking has been changed") : ar ? "تم تأكيد حجزك" : "Your booking is confirmed";
  return ar
    ? { subject: `${head}: ${name} — ${b.reference}`, text: `${head} ${b.reference}.\n\n${name}\n${b.restaurant.addressAr}\n${when}\nعدد الأشخاص: ${b.party}\nرمز الحجز: ${b.code}${fee}\n\nاعرض رمز QR من محفظتك عند الوصول.` }
    : { subject: `${head}: ${name} — ${b.reference}`, text: `${head} — ${b.reference}.\n\n${name}\n${b.restaurant.addressEn}\n${when}\nGuests: ${b.party}\nBooking code: ${b.code}${fee}\n\nShow the QR code from your wallet on arrival.` };
}
