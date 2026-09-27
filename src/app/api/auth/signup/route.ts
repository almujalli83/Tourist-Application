import { accountAction } from "@/lib/auth/respond";
import { completeSignup, signupPrefill } from "@/lib/auth/signin";
import { body, error, handle, json } from "@/lib/http";

/** ?ticket= → the details already known (name, email, number, nationality). */
export const GET = handle(async (req: Request) => {
  const p = await signupPrefill(new URL(req.url).searchParams.get("ticket"));
  return p ? json(p) : error("expired", 422);
});

/** { ticket, fullName, email, phone, nationality, locale } → the new account, signed in. */
export const POST = handle(async (req: Request) => {
  const b = await body<Record<string, unknown>>(req);
  return accountAction(async () => {
    const r = await completeSignup(b ?? {}, req);
    return r.status === "ok" ? json({ user: r.user }, 201) : json({ mfa: true, ticket: r.ticket });
  });
});
