import { confirmPhone } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { currentUser } from "@/lib/auth/session";
import { body, handle, json } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ code?: unknown }>(req);
  return accountAction(async () => {
    await confirmPhone(s.userId, b?.code);
    return json({ user: await currentUser() });
  });
});
