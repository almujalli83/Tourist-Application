import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { bookFlights, FlightError, FlightLegError, listFlightOrders, type FlightBookingInput } from "@/lib/standalone/flights";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ orders: await listFlightOrders(user.id) });
});

/** Pays and issues the e-tickets of the chosen flights, all or none; a failure names the flight to replace. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<FlightBookingInput>(req);
  if (!b) return error("invalidBody");
  try {
    return json({ order: await bookFlights(user, b) }, 201);
  } catch (e) {
    if (e instanceof FlightLegError) return error(e.code, e.status, { leg: e.leg });
    if (e instanceof FlightError) return error(e.code, e.status);
    throw e;
  }
});
