import { completeMfa } from "@/lib/auth/account";
import { accountAction } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** Second sign-in step: { ticket, code } (authenticator code or recovery code). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ ticket?: unknown; code?: unknown }>(req);
  return accountAction(async () => json({ user: await completeMfa(b?.ticket, b?.code, req) }));
});
