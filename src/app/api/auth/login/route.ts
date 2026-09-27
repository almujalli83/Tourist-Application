import { accountAction } from "@/lib/auth/respond";
import { login } from "@/lib/auth/account";
import { body, handle, json } from "@/lib/http";

/** { email, password, remember? } → { user } or { mfa: true, ticket } for the second step. */
export const POST = handle(async (req: Request) => {
  const b = await body<{ email?: unknown; password?: unknown; remember?: unknown }>(req);
  return accountAction(async () => {
    const r = await login(b ?? {}, req);
    return r.status === "ok" ? json({ user: r.user }) : json({ mfa: true, ticket: r.ticket });
  });
});
