import { currentUser } from "@/lib/auth/session";
import { refreshBookingStatus } from "@/lib/bookings/service";
import { error, json } from "@/lib/http";

/** Refreshes the package status from MT getTourismPackageStatus. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const booking = await refreshBookingStatus(user.id, (await params).id);
  return booking ? json({ booking }) : error("notFound", 404);
}
