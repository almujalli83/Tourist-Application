import { body, error, handle, json } from "@/lib/http";
import { RideError, rideOptions } from "@/lib/rides/rides";
import type { RidePoint } from "@/lib/rides/types";

/** Cars and prices from the ride companies for a trip (public). */
export const POST = handle(async (req: Request) => {
  const input = await body<{ pickup?: RidePoint; dropoff?: RidePoint }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ options: await rideOptions(input) });
  } catch (e) {
    if (e instanceof RideError) return error(e.code, e.status);
    throw e;
  }
});
