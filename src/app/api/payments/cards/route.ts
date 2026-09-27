import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { listSavedCards } from "@/lib/payments/intents";

/** The account's saved cards (gateway tokens; brand, last 4 digits, expiry only). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ cards: await listSavedCards(user.id) });
});
