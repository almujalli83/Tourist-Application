import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { eventsCatalog, minPriceSAR, openSessions } from "@/lib/events/orders";
import { currentSeasons } from "@/lib/events/seasons";
import { handle, json } from "@/lib/http";
import { listBookingsByUser } from "@/lib/repo";

/** Events on sale, running / upcoming seasons, and the signed-in traveller's next trip. */
export const GET = handle(async () => {
  const today = todayISO();
  const [catalog, seasons, user] = await Promise.all([eventsCatalog(), currentSeasons(today), currentUser()]);
  const events = catalog
    .map((e) => ({ ...e, sessions: openSessions(e), minPriceSAR: minPriceSAR(e) }))
    .filter((e) => e.sessions.length);
  let trip: { cities: string[]; from: string; to: string } | null = null;
  if (user) {
    const next = (await listBookingsByUser(user.id))
      .filter((b) => b.status !== "CANCELLED" && b.criteria.returnDate >= today)
      .sort((a, b) => a.criteria.departureDate.localeCompare(b.criteria.departureDate))[0];
    if (next) trip = { cities: next.criteria.stays.map((s) => s.city), from: next.criteria.departureDate, to: next.criteria.returnDate };
  }
  return json({ events, seasons, trip });
});
