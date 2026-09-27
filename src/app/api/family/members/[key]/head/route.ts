import { accountAction, signedIn } from "@/lib/auth/respond";
import { familyView, transferHead } from "@/lib/family/family";
import { handle, json } from "@/lib/http";

/** Makes another active member the head. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ key: string }> }) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const key = (await params).key;
  return accountAction(async () => json({ family: familyView(await transferHead(s.userId, key), s.userId) }));
});
