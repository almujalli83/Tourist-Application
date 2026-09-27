import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { getLicenceRules, ruleFor } from "@/lib/rentals/licence";
import { cancelRental, getRental, RentalError } from "@/lib/rentals/rentals";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const r = await getRental(user.id, (await params).id);
  if (!r) return error("notFound", 404);
  const rules = await getLicenceRules();
  return json({ rental: r, licence: ruleFor(rules, r.licenceCountry), reviewed: !!rules.reviewedAt, sourceUrl: rules.sourceUrl });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ rental: await cancelRental(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof RentalError) return error(e.code, e.status);
    throw e;
  }
});
