import { disableMfa } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ password?: unknown; code?: unknown }>(req);
  return accountAction(async () => {
    await disableMfa(s.userId, b?.password, b?.code);
    return json({ ok: true });
  });
});
