import { enableMfa } from "@/lib/auth/account";
import { accountAction, signedIn } from "@/lib/auth/respond";
import { body, handle, json } from "@/lib/http";

/** { password, secret, code } → { codes } (recovery codes, shown once). */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ password?: unknown; secret?: unknown; code?: unknown }>(req);
  return accountAction(async () => json({ codes: await enableMfa(s.userId, b?.password, b?.secret, b?.code) }));
});
