import { accountAction, signedIn } from "@/lib/auth/respond";
import { createFamily, deleteFamily, familyOf, familyTrips, familyView, renameFamily } from "@/lib/family/family";
import { body, handle, json } from "@/lib/http";

/** The user's family (or null) and the trips its members share. */
export const GET = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const f = await familyOf(s.userId);
  return json({ family: f ? familyView(f, s.userId) : null, trips: f ? await familyTrips(s.userId) : [] });
});

/** { name } — creates a family with the user as head. */
export const POST = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ name?: unknown }>(req);
  return accountAction(async () => json({ family: familyView(await createFamily(s.userId, b?.name), s.userId) }, 201));
});

/** { name } — renames (head). */
export const PUT = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ name?: unknown }>(req);
  return accountAction(async () => json({ family: familyView(await renameFamily(s.userId, b?.name), s.userId) }));
});

/** Ends the family (head). */
export const DELETE = handle(async () => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return accountAction(async () => {
    await deleteFamily(s.userId);
    return json({ ok: true });
  });
});
