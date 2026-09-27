import { checkResetToken, resetPassword } from "@/lib/auth/account";
import { accountAction } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** ?token= → { valid } */
export const GET = handle(async (req: Request) => json({ valid: await checkResetToken(new URL(req.url).searchParams.get("token")) }));

/** { token, password } → signed in with the new password (or { mfa, ticket }). */
export const POST = handle(async (req: Request) => {
  const b = await body<{ token?: unknown; password?: unknown }>(req);
  return accountAction(async () => {
    const r = await resetPassword(b?.token, b?.password, req);
    return r.status === "ok" ? json({ user: r.user }) : json({ mfa: true, ticket: r.ticket });
  });
});
