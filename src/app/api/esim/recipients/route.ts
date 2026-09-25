import { currentUser } from "@/lib/auth/session";
import { recipientOptions } from "@/lib/esim/orders";
import { error, handle, json } from "@/lib/http";

/** Who can receive an eSIM: the account holder, saved travellers and booking travellers (emails masked). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ recipients: await recipientOptions(user) });
});
