import { deleteAccount } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { password, code? } — deletes the account (not while a trip is upcoming). */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ password?: unknown; code?: unknown }>(req);
  return accountAction(async () => {
    await deleteAccount(s.userId, b?.password, b?.code);
    return json({ ok: true });
  });
});
