import { accountAction, signedIn } from "@/lib/auth/respond";
import { familyView, updateSharing } from "@/lib/family/family";
import { body, handle, json } from "@/lib/http";

/** { shareTrips?, shareTravellers? } — what this member shares with the family. */
export const PUT = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ shareTrips?: unknown; shareTravellers?: unknown }>(req);
  return accountAction(async () => json({ family: familyView(await updateSharing(s.userId, b ?? {}), s.userId) }));
});
