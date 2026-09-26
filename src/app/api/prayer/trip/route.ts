import { currentUser } from "@/lib/auth/session";
import { handle, json } from "@/lib/http";
import { tripCityToday } from "@/lib/prayer/trip";

/** The city of the traveller's trip today (or a sample trip in sandbox mode). */
export const GET = handle(async () => {
  const user = await currentUser();
  return json({ trip: await tripCityToday(user?.id ?? null) });
});
