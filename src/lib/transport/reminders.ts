/**
 * Transport reminders of a package: on the arrival day, how to get from the airport to the city
 * (ride apps with an estimate, Haramain train from Jeddah airport); on the departure day, when to
 * leave for the airport (3 hours before an international take-off plus the ride), in the app and
 * by email.
 */
import type { StoredBooking } from "../bookings/types";
import { cityName } from "../data/cities";
import { CITY_CENTERS } from "../guide/centers";
import { notifyTravellers } from "../notify";
import type { AppNotification } from "../reminders/reminders";
import { getUserById, listBookingsByUser } from "../repo";
import { store } from "../store";
import { AIRPORTS, estimateRide } from "./rides";

export { AIRPORTS };

/** Be at the airport this long before an international take-off. */
const AIRPORT_BEFORE_MIN = 180;

const ksaToday = (now: Date) => new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const ksaMs = (local: string) => Date.parse(`${local}:00+03:00`);
const clock = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().slice(11, 16);
/** Rounded down to a quarter hour. */
const quarter = (ms: number) => Math.floor(ms / 900_000) * 900_000;

async function notify(userId: string, doc: AppNotification) {
  if (!(await store().insert("notifications", doc.id, doc))) return false;
  const user = await getUserById(userId);
  if (user) {
    const sent = await notifyTravellers([user.email], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }, { bookingId: doc.bookingId });
    if (sent) await store().update<AppNotification>("notifications", doc.id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
  }
  return true;
}

function cityOfAirport(b: StoredBooking, first: boolean): string {
  const stays = b.criteria.stays;
  const s = first ? stays[0] : stays[stays.length - 1];
  return s.city;
}

export async function transportReminders(userId: string, now = new Date()): Promise<number> {
  const today = ksaToday(now);
  let n = 0;
  for (const b of await listBookingsByUser(userId)) {
    if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED") continue;
    const base = { userId, kind: "transport" as const, bookingId: b.id, reference: b.reference, createdAt: now.toISOString(), href: "/transport", readAt: null, deletedAt: null, email: null };
    const out = b.flights.find((f) => f.kind === "outbound");
    const ret = b.flights.find((f) => f.kind === "return");

    // Arrival day, until three hours after landing.
    if (out && out.arriveAt.slice(0, 10) === today && now.getTime() <= ksaMs(out.arriveAt) + 3 * 3600_000) {
      const city = cityOfAirport(b, true);
      const ap = AIRPORTS[out.to];
      const center = CITY_CENTERS[city];
      const e = ap && center ? estimateRide(ap, center) : null;
      const ar = [`هبوطك الساعة ${out.arriveAt.slice(11, 16)} في ${cityName(out.to, "ar")}. للوصول إلى ${cityName(city, "ar")}: اطلب سيارة من تطبيق مرخّص (أوبر، كريم، جيني) أو سيارة أجرة المطار الرسمية.`];
      const en = [`You land at ${out.arriveAt.slice(11, 16)} in ${cityName(out.to, "en")}. To get to ${cityName(city, "en")}: order a car in a licensed app (Uber, Careem, Jeeny) or take an official airport taxi.`];
      if (e) {
        ar.push(`تقديريًا إلى وسط المدينة: ${e.minSAR}–${e.maxSAR} ريال، نحو ${e.mins} دقيقة.`);
        en.push(`Estimate to the city centre: SAR ${e.minSAR}–${e.maxSAR}, about ${e.mins} min.`);
      }
      if (out.to === "JED") {
        ar.push(city === "MKX" ? "إلى مكة المكرمة: قطار الحرمين من محطة المطار مباشرة." : "قطار الحرمين يربط المطار بجدة ومكة والمدينة.");
        en.push(city === "MKX" ? "To Makkah: the Haramain train leaves from the airport station." : "The Haramain train links the airport with Jeddah, Makkah and Madinah.");
      }
      if (await notify(userId, { ...base, id: `transport:arrival:${b.id}`, titleAr: "من المطار إلى وجهتك", titleEn: "From the airport to your stay", linesAr: ar, linesEn: en })) n++;
    }

    // Departure day, until take-off.
    if (ret && ret.departAt.slice(0, 10) === today && now.getTime() < ksaMs(ret.departAt)) {
      const city = cityOfAirport(b, false);
      const ap = AIRPORTS[ret.from];
      const center = CITY_CENTERS[city];
      const e = ap && center ? estimateRide(center, ap) : null;
      const beAt = ksaMs(ret.departAt) - AIRPORT_BEFORE_MIN * 60_000;
      const leave = quarter(beAt - (e ? e.mins + 15 : 60) * 60_000);
      const ar = [
        `رحلتك ${ret.flightNo} تقلع الساعة ${ret.departAt.slice(11, 16)} من ${cityName(ret.from, "ar")}: كن في المطار قبل ${clock(beAt)}، واطلب سيارتك لتنطلق قبل ${clock(leave)} تقريبًا.`,
        ...(e ? [`تقديريًا من وسط المدينة: ${e.minSAR}–${e.maxSAR} ريال، نحو ${e.mins} دقيقة (أضف وقتًا للازدحام).`] : []),
      ];
      const en = [
        `Flight ${ret.flightNo} leaves at ${ret.departAt.slice(11, 16)} from ${cityName(ret.from, "en")}: be at the airport by ${clock(beAt)} and set off by about ${clock(leave)}.`,
        ...(e ? [`Estimate from the city centre: SAR ${e.minSAR}–${e.maxSAR}, about ${e.mins} min (allow for traffic).`] : []),
      ];
      if (await notify(userId, { ...base, id: `transport:departure:${b.id}`, titleAr: "اطلب سيارتك إلى المطار", titleEn: "Order your car to the airport", linesAr: ar, linesEn: en })) n++;
    }
  }
  return n;
}
