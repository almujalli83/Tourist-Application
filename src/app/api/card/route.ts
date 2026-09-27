import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { listCards } from "@/lib/card/card";

/** The account's digital tourist cards (every traveller with an issued visa). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ cards: await listCards(user.id) });
});
