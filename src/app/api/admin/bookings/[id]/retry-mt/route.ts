import { getAnyBooking } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { retryMtForBooking } from "@/lib/bookings/modify";
import { BookingError } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";

/** Back office: re-sends the latest package change to MT for applicants not yet updated. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const input = await body<{ modificationId?: string }>(req);
  const b = await getAnyBooking((await params).id);
  if (!b || !input?.modificationId) return error("notFound", 404);
  try {
    const updated = await retryMtForBooking(b, input.modificationId);
    return json({ status: updated.modifications?.find((m) => m.id === input.modificationId)?.mt.status });
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422);
    throw err;
  }
});
