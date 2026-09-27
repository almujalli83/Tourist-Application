import { sendEmailVerification } from "@/lib/auth/account";
import { accountAction, localeOf, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** Sends the confirmation link again. */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ locale?: unknown }>(req);
  return accountAction(async () => {
    await sendEmailVerification(s.userId, localeOf(b?.locale), req);
    return json({ ok: true });
  });
});
