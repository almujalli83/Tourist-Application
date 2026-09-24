import { currentUser } from "@/lib/auth/session";
import { getBooking } from "@/lib/bookings/service";
import { error, json } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const booking = await getBooking(user.id, (await params).id);
  return booking ? json({ booking }) : error("notFound", 404);
}
