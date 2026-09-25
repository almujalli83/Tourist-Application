import { currentUser } from "@/lib/auth/session";
import { diffDays, todayISO } from "@/lib/dates";
import { listPlans } from "@/lib/esim/tygo";
import { handle, json } from "@/lib/http";
import { listBookingsByUser } from "@/lib/repo";

/** Tygo plans, and the signed-in traveller's next trip length (to suggest a plan). */
export const GET = handle(async () => {
  const user = await currentUser();
  let tripDays: number | null = null;
  if (user) {
    const today = todayISO();
    const next = (await listBookingsByUser(user.id))
      .filter((b) => b.status !== "CANCELLED" && b.criteria.returnDate >= today)
      .sort((a, b) => a.criteria.departureDate.localeCompare(b.criteria.departureDate))[0];
    if (next) tripDays = diffDays(next.criteria.departureDate, next.criteria.returnDate) + 1;
  }
  return json({ plans: listPlans(), tripDays });
});
