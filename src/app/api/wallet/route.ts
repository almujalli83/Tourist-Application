import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { walletOverview } from "@/lib/wallet";

export const maxDuration = 60;

/** The account's wallet: travellers with their documents (issued visas are synced first). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json(await walletOverview(user.id));
});
