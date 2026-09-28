import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelFlightOrder, FlightError, flightCancelTerms, getFlightOrder } from "@/lib/standalone/flights";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const order = await getFlightOrder(user.id, (await ctx.params).id);
  return order ? json({ order, cancel: flightCancelTerms(order) }) : error("notFound", 404);
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ order: await cancelFlightOrder(user, (await ctx.params).id) });
  } catch (e) {
    if (e instanceof FlightError) return error(e.code, e.status);
    throw e;
  }
});
