/**
 * Sample reminders for sandbox mode (no MT credentials), so the service can be seen without
 * booking a trip that starts within 3 days: a traveller with no notifications yet gets one of each
 * kind, built from a sample trip with the same wording as the real reminders. They are marked as
 * samples, aren't emailed and can be deleted like any notification. Off with DEMO_NOTIFICATIONS=off.
 */
import type { StoredBooking } from "../bookings/types";
import { mtConfig } from "../config";
import { addDays } from "../dates";
import { fmtDay } from "../events/format";
import { store } from "../store";
import { content, type AppNotification, type ReminderKind } from "./reminders";

const COL = "notifications" as const;
const KINDS: ReminderKind[] = ["visa1", "visa7", "departure", "arrival"];

export const demoNotificationsEnabled = () => mtConfig().mock && process.env.DEMO_NOTIFICATIONS !== "off";

/** A sample trip: arrives in 3 days, 5 nights in Riyadh and AlUla, visas expiring a year on. */
function sampleTrip(userId: string, today: string): StoredBooking {
  const dep = addDays(today, 3);
  const ret = addDays(dep, 5);
  const expiry = addDays(today, 365);
  const applicant = (nameEn: string) => ({ nameEn, email: "", visaNumber: "6000000001", visaExpiryDate: expiry });
  return {
    id: "demo", reference: "TA-DEMO2026", userId, status: "COMPLETED",
    mt: { packageStatus: "COMPLETED" },
    criteria: { departureDate: dep, returnDate: ret },
    flights: [
      { kind: "outbound", carrierNameAr: "السعودية", carrierNameEn: "Saudia", flightNo: "SV306", from: "CAI", to: "RUH", departAt: `${dep}T10:40`, arriveAt: `${dep}T13:30` },
      { kind: "return", carrierNameAr: "السعودية", carrierNameEn: "Saudia", flightNo: "SV305", from: "ULH", to: "CAI", departAt: `${ret}T16:10`, arriveAt: `${ret}T18:20` },
    ],
    hotels: [
      { nameAr: "فندق نجد الكبير", nameEn: "Najd Grand Hotel", city: "RUH", checkIn: dep },
      { nameAr: "نُزل إطلالة الجبل", nameEn: "Mountain View Lodge", city: "ULH", checkIn: addDays(dep, 3) },
    ],
    applicants: [applicant("AHMED ALI"), applicant("SARA ALI")],
    esim: { orderId: "demo", amountSAR: 0 },
  } as unknown as StoredBooking;
}

/** Adds the samples (once each) for a traveller without real notifications. */
export async function seedDemoNotifications(userId: string, now = new Date()): Promise<void> {
  if (!demoNotificationsEnabled()) return;
  const existing = await store().findBy<AppNotification>(COL, "userId", userId);
  if (existing.some((n) => !n.demo)) return;
  const has = new Set(existing.map((n) => n.id));
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const trip = sampleTrip(userId, today);
  // The moment each reminder would be sent for this trip.
  const at: Record<ReminderKind, string> = {
    arrival: addDays(trip.criteria.departureDate, -3),
    departure: addDays(trip.criteria.returnDate, -1),
    visa7: addDays(trip.applicants[0].visaExpiryDate!, -7),
    visa1: addDays(trip.applicants[0].visaExpiryDate!, -1),
  };
  for (const [i, kind] of KINDS.entries()) {
    if (has.has(`demo:${userId}:${kind}`)) continue;
    const c = await content(trip, kind, new Date(`${at[kind]}T09:00:00+03:00`));
    if (kind === "arrival") {
      // As for a package booked from the trip planner.
      const d = addDays(trip.criteria.departureDate, 1);
      c.linesAr.push(`🗓️ أول يوم في برنامجك (${fmtDay(d, "ar", { weekday: "long", day: "numeric", month: "long" })}): حي الطريف التاريخي، بوليفارد الرياض سيتي (20:00)، مطعم نجد التراثي.`);
      c.linesEn.push(`🗓️ First day of your programme (${fmtDay(d, "en", { weekday: "long", day: "numeric", month: "long" })}): At-Turaif Historic District, Boulevard Riyadh City (20:00), Najd Heritage Restaurant.`);
    }
    const doc: AppNotification = {
      id: `demo:${userId}:${kind}`, userId, kind, bookingId: "demo", reference: trip.reference,
      // Newest first: the arrival reminder on top.
      createdAt: new Date(now.getTime() - (KINDS.length - i) * 60_000).toISOString(),
      ...c, href: kind === "arrival" || kind === "departure" ? "/account" : c.href,
      readAt: null, deletedAt: null, email: null, demo: true,
    };
    await store().insert(COL, doc.id, doc);
  }
  // A request to rate the sample trip (the ratings service, with sample items to rate).
  const reviewId = `demo:${userId}:review`;
  if (!has.has(reviewId)) {
    await store().insert<AppNotification>(COL, reviewId, {
      id: reviewId, userId, kind: "review", bookingId: "demo", reference: trip.reference, createdAt: now.toISOString(),
      titleAr: "قيّم تجربتك مع سعودي تريب", titleEn: "Rate your experience with Saudi Trip",
      linesAr: [
        "رأيك يساعد المسافرين ويرفع جودة الخدمات السياحية في المملكة. يمكنك تقييم:",
        "⭐ رحلة الرياض والعُلا (رحلة تجريبية TA-DEMO2026)",
        "⭐ فندق نجد الكبير، والسعودية، وجولة الطريف الليلية، ومطعم ومَعلم في الرياض",
        "⭐ خدمة الباقات السياحية والتأشيرة، ومخطط الرحلة الذكي",
      ],
      linesEn: [
        "Your opinion helps other travellers and raises the quality of tourism services in Saudi Arabia. You can rate:",
        "⭐ Trip to Riyadh & AlUla (sample trip TA-DEMO2026)",
        "⭐ Najd Grand Hotel, Saudia, At-Turaif Night Tour, a restaurant and a landmark in Riyadh",
        "⭐ Tourism package & visa service, and the smart trip planner",
      ],
      href: "/account/reviews", readAt: null, deletedAt: null, email: null, demo: true,
    });
  }
}
