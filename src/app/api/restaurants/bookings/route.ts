import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { bookTable, listTableBookings, RestaurantBookingError, type BookInput } from "@/lib/restaurants/bookings";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ bookings: await listTableBookings(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<BookInput>(req);
  if (!input || typeof input.restaurantId !== "string") return error("invalidRequest", 400);
  try {
    return json({ booking: await bookTable(user, input) }, 201);
  } catch (e) {
    if (e instanceof RestaurantBookingError) return error(e.code, e.status);
    throw e;
  }
});
