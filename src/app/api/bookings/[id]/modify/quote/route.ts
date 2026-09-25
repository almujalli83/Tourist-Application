import { currentUser } from "@/lib/auth/session";
import { quoteModification, type ModificationPlan } from "@/lib/bookings/modify";
import { BookingError, getBooking } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";

/** Prices a modification plan (changes, charges and refunds) without applying it. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const booking = await getBooking(user.id, (await params).id);
  if (!booking) return error("notFound", 404);
  const plan = await body<ModificationPlan>(req);
  if (!plan?.newReturnDate || !plan.offers) return error("invalidBody");
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { next, ...quote } = quoteModification(booking, plan);
    return json({ quote });
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    throw err;
  }
});
