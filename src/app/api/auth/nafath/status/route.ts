import { accountAction } from "@/lib/auth/respond";
import { currentUser } from "@/lib/auth/session";
import { pollNafath } from "@/lib/auth/signin";
import { body, handle, json } from "@/lib/http";

/** { ticket } → { status: "waiting" } | { status: "ok", user } | { status: "mfa", ticket } | { status: "signup", ticket } | { status: "linked" } */
export const POST = handle(async (req: Request) => {
  const b = await body<{ ticket?: unknown }>(req);
  const user = await currentUser();
  return accountAction(async () => json(await pollNafath(b?.ticket, req, user?.id ?? null)));
});
