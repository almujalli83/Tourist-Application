import { newRecovery } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** New recovery codes (the old ones stop working): { code } from the app. */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ code?: unknown }>(req);
  return accountAction(async () => json({ codes: await newRecovery(s.userId, b?.code) }));
});
