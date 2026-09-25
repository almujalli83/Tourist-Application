import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { passengerOptions } from "@/lib/trains/orders";

/** Saved travellers and travellers of the account's bookings (passports masked). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ passengers: await passengerOptions(user.id) });
});
