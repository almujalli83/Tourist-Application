import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelGuideRequest, getGuideBooking, GuideBookingError } from "@/lib/guides/bookings";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await getGuideBooking(user.id, (await params).id);
  return b ? json({ booking: b }) : error("notFound", 404);
});

/** The traveller cancels the request. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ booking: await cancelGuideRequest(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof GuideBookingError) return error(e.code, e.status);
    throw e;
  }
});
