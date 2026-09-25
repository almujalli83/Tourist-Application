import { getAnyBooking } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { refreshBookingStatus } from "@/lib/bookings/service";
import { error, handle, json } from "@/lib/http";

/** Back office: pulls the package status from MT. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const b = await getAnyBooking((await params).id);
  if (!b) return error("notFound", 404);
  const updated = await refreshBookingStatus(b.userId, b.id);
  return json({ status: updated?.mt.packageStatus ?? null });
});
