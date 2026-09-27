import { requestEmailChange } from "@/lib/auth/account";
import { accountAction, localeOf, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { password, email, locale } — a confirmation link goes to the new address. */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ password?: unknown; email?: unknown; locale?: unknown }>(req);
  return accountAction(async () => {
    await requestEmailChange(s.userId, b?.password, b?.email, localeOf(b?.locale), req);
    return json({ ok: true });
  });
});
