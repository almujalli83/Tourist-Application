import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelFlightOrder, cancelFlightSegment, FlightError, flightCancelTerms, getFlightOrder, segmentCancelTerms } from "@/lib/standalone/flights";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const order = await getFlightOrder(user.id, (await ctx.params).id);
  return order ? json({ order, cancel: flightCancelTerms(order), segments: order.segments.map((_, i) => segmentCancelTerms(order, i)) }) : error("notFound", 404);
});

/** Cancels the booking, or one flight of a multi-city trip with ?segment=<index>. */
export const DELETE = handle(async (req: Request, ctx: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const id = (await ctx.params).id;
  const seg = new URL(req.url).searchParams.get("segment");
  try {
    if (seg !== null) {
      const i = Number(seg);
      if (!Number.isInteger(i) || i < 0) return error("invalidSegment");
      return json({ order: await cancelFlightSegment(user, id, i) });
    }
    return json({ order: await cancelFlightOrder(user, id) });
  } catch (e) {
    if (e instanceof FlightError) return error(e.code, e.status);
    throw e;
  }
});
