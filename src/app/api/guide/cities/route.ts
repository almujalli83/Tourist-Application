import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { cityCounts } from "@/lib/guide/repo";
import { handle, json } from "@/lib/http";
import { listBookingsByUser } from "@/lib/repo";

/** Places per city, and the signed-in traveller's trip cities (current and upcoming trips first). */
export const GET = handle(async () => {
  const user = await currentUser();
  const counts = await cityCounts();
  const tripCities: string[] = [];
  if (user) {
    const today = todayISO();
    const trips = (await listBookingsByUser(user.id))
      .filter((b) => b.status !== "CANCELLED" && b.criteria.returnDate >= today)
      .sort((a, b) => a.criteria.departureDate.localeCompare(b.criteria.departureDate));
    for (const b of trips) for (const s of b.criteria.stays) if (!tripCities.includes(s.city)) tripCities.push(s.city);
  }
  return json({ counts, tripCities });
});
