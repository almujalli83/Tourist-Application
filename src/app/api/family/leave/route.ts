import { accountAction, signedIn } from "@/lib/auth/respond";
import { leaveFamily } from "@/lib/family/family";
import { handle, json } from "@/lib/http";

export const POST = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return accountAction(async () => {
    await leaveFamily(s.userId);
    return json({ ok: true });
  });
});
