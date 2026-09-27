import { accountAction, signedIn } from "@/lib/auth/respond";
import { signInMethods, unlinkMethod } from "@/lib/auth/signin";
import { handle, json } from "@/lib/http";

/** Sign-in methods of the account (password and linked identities). */
export const GET = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return json(await signInMethods(s.userId));
});

/** ?id= — removes a linked method (at least one way to sign in stays). */
export const DELETE = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return accountAction(async () => {
    await unlinkMethod(s.userId, new URL(req.url).searchParams.get("id") ?? "");
    return json(await signInMethods(s.userId));
  });
});
