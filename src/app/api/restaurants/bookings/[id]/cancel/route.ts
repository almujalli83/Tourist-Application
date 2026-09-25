import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelTableBooking, RestaurantBookingError } from "@/lib/restaurants/bookings";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ booking: await cancelTableBooking(user, (await params).id) });
  } catch (e) {
    if (e instanceof RestaurantBookingError) return error(e.code, e.status);
    throw e;
  }
});
