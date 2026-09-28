import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelStay, getStay, stayCancelTerms, StayError } from "@/lib/standalone/stays";

type Ctx = { params: Promise<{ id: string }> };

/** The booking with what cancelling now would mean. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const stay = await getStay(user.id, (await ctx.params).id);
  return stay ? json({ stay, cancel: stayCancelTerms(stay) }) : error("notFound", 404);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ stay: await cancelStay(user, (await ctx.params).id) });
  } catch (e) {
    if (e instanceof StayError) return error(e.code, e.status);
    throw e;
  }
});
