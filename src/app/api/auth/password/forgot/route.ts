import { requestPasswordReset } from "@/lib/auth/account";
import { accountAction, localeOf } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { email, locale } — the same answer whether or not the email has an account. */
export const POST = handle(async (req: Request) => {
  const b = await body<{ email?: unknown; locale?: unknown }>(req);
  return accountAction(async () => {
    await requestPasswordReset(b?.email, localeOf(b?.locale), req);
    return json({ ok: true });
  });
});
