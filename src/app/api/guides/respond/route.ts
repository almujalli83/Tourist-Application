import { body, error, handle, json } from "@/lib/http";
import { GuideBookingError, respondToRequest } from "@/lib/guides/bookings";

/** The guide confirms or declines a request (secret link from the email). */
export const POST = handle(async (req: Request) => {
  const input = await body<{ token?: string; action?: string; note?: string }>(req);
  if (!input || typeof input.token !== "string" || (input.action !== "confirm" && input.action !== "decline")) return error("invalidRequest", 400);
  try {
    return json({ booking: await respondToRequest(input.token, input.action, typeof input.note === "string" ? input.note : null) });
  } catch (e) {
    if (e instanceof GuideBookingError) return error(e.code, e.status);
    throw e;
  }
});
