import { accountAction } from "@/lib/auth/respond";
import { sendLoginCode } from "@/lib/auth/signin";
import { body, handle, json } from "@/lib/http";

/** { phone } — a sign-in code by SMS. */
export const POST = handle(async (req: Request) => {
  const b = await body<{ phone?: unknown }>(req);
  return accountAction(async () => json(await sendLoginCode(b?.phone, req)));
});
