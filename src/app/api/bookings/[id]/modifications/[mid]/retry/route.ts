import { currentUser } from "@/lib/auth/session";
import { retryModificationMt } from "@/lib/bookings/modify";
import { BookingError } from "@/lib/bookings/service";
import { error, handle, json } from "@/lib/http";

/** Re-sends a modification's travel details to MT for applicants that were not updated. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const { id, mid } = await params;
  try {
    return json({ booking: await retryModificationMt(user, id, mid) });
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    throw err;
  }
});
