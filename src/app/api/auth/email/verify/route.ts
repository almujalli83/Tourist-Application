import { verifyEmail } from "@/lib/auth/account";
import { accountAction } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { token } from the confirmation link (new account or new email). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ token?: unknown }>(req);
  return accountAction(async () => json({ result: await verifyEmail(b?.token) }));
});
