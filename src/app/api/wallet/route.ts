import { currentUser } from "@/lib/auth/session";
import { syncEvisaWallet } from "@/lib/evisa/service";
import { error, handle, json } from "@/lib/http";
import { walletOverview } from "@/lib/wallet";

export const maxDuration = 60;

/** The account's wallet: travellers with their documents (issued visas — package and tourist eVisa — are synced first). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await syncEvisaWallet(user.id).catch((err) => console.error("eVisa wallet sync failed", err));
  return json(await walletOverview(user.id));
});
