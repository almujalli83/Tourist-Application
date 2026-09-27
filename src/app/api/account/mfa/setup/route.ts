import { beginMfa } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { handle, json } from "@/lib/http";

/** A new secret with its QR code for the authenticator app. */
export const POST = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return accountAction(async () => json(await beginMfa(s.userId)));
});
