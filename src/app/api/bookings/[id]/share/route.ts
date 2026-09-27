import { accountAction, localeOf, signedIn } from "@/lib/auth/respond";
import { createTripShare, listTripShares, revokeTripShare } from "@/lib/family/share";
import { body, error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Active share links of the trip. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return json({ links: await listTripShares(s.userId, (await params).id) });
});

/** { locale } → a new read-only link for companions. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  const b = await body<{ locale?: unknown }>(req);
  const id = (await params).id;
  return accountAction(async () => json(await createTripShare(s.userId, id, localeOf(b?.locale), req), 201));
});

/** ?ref= — stops a link. */
export const DELETE = handle(async (req: Request) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return (await revokeTripShare(s.userId, new URL(req.url).searchParams.get("ref") ?? "")) ? json({ ok: true }) : error("notFound", 404);
});
