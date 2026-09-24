import { currentUser } from "@/lib/auth/session";
import { BookingError, createBooking, listBookings, type CreateBookingInput } from "@/lib/bookings/service";
import { body, error, json } from "@/lib/http";

export const maxDuration = 60;

export async function GET() {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ bookings: await listBookings(user.id) });
}

/** Pays for the package and submits one MT eVisa application per traveller. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<CreateBookingInput>(req);
  if (!input?.selection || !Array.isArray(input.travellers) || !input.card) return error("invalidBody");
  try {
    const booking = await createBooking(user, input);
    return json({ booking: { id: booking.id, reference: booking.reference } }, 201);
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    console.error("booking failed", err);
    return error("generic", 500);
  }
}
