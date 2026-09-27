import { accountAction, localeOf } from "@/lib/auth/respond";
import { verifyLoginCode } from "@/lib/auth/signin";
import { body, handle, json } from "@/lib/http";

/** { phone, code, locale, remember } → { user } | { mfa, ticket } | { signup: ticket } */
export const POST = handle(async (req: Request) => {
  const b = await body<{ phone?: unknown; code?: unknown; locale?: unknown; remember?: unknown }>(req);
  return accountAction(async () => json(await verifyLoginCode(b?.phone, b?.code, req, { locale: localeOf(b?.locale), remember: b?.remember !== false })));
});
