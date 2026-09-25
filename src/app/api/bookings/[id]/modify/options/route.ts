import { currentUser } from "@/lib/auth/session";
import { modificationOptions, type ModificationTarget } from "@/lib/bookings/modify";
import { BookingError, getBooking } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";

/** Offers for a new return date: return flights (issuing agent), hotels and domestic flights. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const booking = await getBooking(user.id, (await params).id);
  if (!booking) return error("notFound", 404);
  const input = await body<{ newReturnDate?: string; target?: ModificationTarget }>(req);
  if (!input?.newReturnDate) return error("invalidBody");
  try {
    return json(await modificationOptions(booking, { newReturnDate: input.newReturnDate, target: input.target }));
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    throw err;
  }
});
