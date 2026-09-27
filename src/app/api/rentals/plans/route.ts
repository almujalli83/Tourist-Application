import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { rentalPlansFromBooking } from "@/lib/rentals/rentals";
import { listBookingsByUser } from "@/lib/repo";

/** Suggested rentals for a package: one per city stay. */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const id = new URL(req.url).searchParams.get("bookingId");
  const b = (await listBookingsByUser(user.id)).find((x) => x.id === id);
  if (!b) return error("notFound", 404);
  return json({ plans: rentalPlansFromBooking(b), driverName: b.applicants[0]?.nameEn ?? "" });
});
