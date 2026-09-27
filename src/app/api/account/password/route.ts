import { changePassword } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { current, next } — other devices are signed out. */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ current?: unknown; next?: unknown }>(req);
  return accountAction(async () => {
    await changePassword(s.userId, s.sessionId, b?.current, b?.next);
    return json({ ok: true });
  });
});
