import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { changeTableBooking, RestaurantBookingError, type Slot } from "@/lib/restaurants/bookings";
import type { CardInput } from "@/lib/payment";

type Ctx = { params: Promise<{ id: string }> };

/** { day, time, party, expectedDeltaSAR, card? } */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<Slot & { expectedDeltaSAR: number; card?: CardInput }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ booking: await changeTableBooking(user, (await params).id, input) });
  } catch (e) {
    if (e instanceof RestaurantBookingError) return error(e.code, e.status);
    throw e;
  }
});
