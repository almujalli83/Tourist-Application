import { accountAction, localeOf, signedIn } from "@/lib/auth/respond";
import { familyView, inviteMember } from "@/lib/family/family";
import { body, handle, json } from "@/lib/http";

/** { email, name, relation, locale } — sends an invitation (head). */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ email?: unknown; name?: unknown; relation?: unknown; locale?: unknown }>(req);
  return accountAction(async () => json({ family: familyView(await inviteMember(s.userId, b ?? {}, localeOf(b?.locale), req), s.userId) }));
});
