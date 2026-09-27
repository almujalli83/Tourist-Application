import { accountAction, localeOf } from "@/lib/auth/respond";
import { currentUser } from "@/lib/auth/session";
import { startNafath } from "@/lib/auth/signin";
import { body, handle, json } from "@/lib/http";

/** { nationalId, locale, mode } → { ticket, random } (the number to choose in the Nafath app). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ nationalId?: unknown; locale?: unknown; mode?: unknown }>(req);
  const mode = b?.mode === "link" ? "link" : "login";
  const user = mode === "link" ? await currentUser() : null;
  return accountAction(async () => json(await startNafath(b?.nationalId, localeOf(b?.locale), req, { mode, userId: user?.id ?? null })));
});
