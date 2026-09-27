import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { GuideBookingError, listGuideBookings, requestGuide, type GuideRequestInput } from "@/lib/guides/bookings";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ bookings: await listGuideBookings(user.id) });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<GuideRequestInput>(req);
  if (!input || typeof input.licenseNo !== "string") return error("invalidRequest", 400);
  try {
    return json({ booking: await requestGuide(user, input, new URL(req.url).origin) }, 201);
  } catch (e) {
    if (e instanceof GuideBookingError) return error(e.code, e.status);
    throw e;
  }
});
