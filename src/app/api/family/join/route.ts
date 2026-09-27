import { accountAction, signedIn } from "@/lib/auth/respond";
import { acceptInvite, familyView, invitePreview } from "@/lib/family/family";
import { body, error, handle, json } from "@/lib/http";

/** ?token= → who invited and to which family. */
export const GET = handle(async (req: Request) => {
  const p = await invitePreview(new URL(req.url).searchParams.get("token"));
  return p ? json(p) : error("expired", 422);
});

/** { token, shareTrips, shareTravellers } — joins (signed in with the invited email). */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ token?: unknown; shareTrips?: unknown; shareTravellers?: unknown }>(req);
  return accountAction(async () => json({ family: familyView(await acceptInvite(s.userId, b?.token, b ?? {}), s.userId) }));
});
