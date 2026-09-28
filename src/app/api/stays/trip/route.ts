import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { bookStayTrip, StayError, StayTripError, type StayTripInput } from "@/lib/standalone/stays";

/** Books a hotel in each city of a trip, all or nothing; a failure names the hotel to replace. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<StayTripInput>(req);
  if (!b) return error("invalidBody");
  try {
    return json(await bookStayTrip(user, b), 201);
  } catch (e) {
    if (e instanceof StayTripError) return error(e.code, e.status, { leg: e.leg });
    if (e instanceof StayError) return error(e.code, e.status);
    throw e;
  }
});
