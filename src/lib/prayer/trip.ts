/** The city where the signed-in traveller is today, from their current trip (for prayer times). */
import { CITY_CENTERS } from "../guide/centers";
import { mtConfig } from "../config";
import { stayDates } from "../itinerary";
import { listBookingsByUser } from "../repo";

export interface TripCity {
  city: string;
  lat: number;
  lng: number;
  reference: string;
  /** Sample trip (sandbox) when the traveller has no trip today. */
  demo?: boolean;
}

export async function tripCityToday(userId: string | null, now = new Date()): Promise<TripCity | null> {
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  if (userId) {
    for (const b of await listBookingsByUser(userId)) {
      if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED") continue;
      if (today < b.criteria.departureDate || today > b.criteria.returnDate) continue;
      const stays = stayDates(b.criteria);
      const stay = stays.find((s) => today >= s.checkIn && today < s.checkOut) ?? stays[stays.length - 1];
      const c = CITY_CENTERS[stay.city];
      if (c) return { city: stay.city, lat: c.lat, lng: c.lng, reference: b.reference };
    }
  }
  // Sandbox: a sample trip in Riyadh so the option can be tried.
  if (mtConfig().mock && process.env.DEMO_PRAYER !== "off") return { city: "RUH", lat: CITY_CENTERS.RUH.lat, lng: CITY_CENTERS.RUH.lng, reference: "TA-DEMO2026", demo: true };
  return null;
}
