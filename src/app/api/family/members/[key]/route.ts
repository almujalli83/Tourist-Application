import { accountAction, signedIn } from "@/lib/auth/respond";
import { familyView, removeMember } from "@/lib/family/family";
import { handle, json } from "@/lib/http";

/** Removes a member or cancels an invitation (head). */
export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const key = (await params).key;
  return accountAction(async () => json({ family: familyView(await removeMember(s.userId, key), s.userId) }));
});
