import { requireAdmin } from "@/lib/auth/admin";
import { handle, json } from "@/lib/http";
import { adminGuideBookings } from "@/lib/guides/bookings";
import { adminGuides } from "@/lib/guides/guides";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ guides: await adminGuides(), bookings: await adminGuideBookings(), mtConfigured: !!process.env.MT_GUIDES_URL?.trim() });
});
