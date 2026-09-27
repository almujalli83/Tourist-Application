import { sendPhoneCode } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { handle, json } from "@/lib/http";

/** Sends a code to the profile's mobile number. */
export const POST = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return accountAction(async () => json(await sendPhoneCode(s.userId)));
});
