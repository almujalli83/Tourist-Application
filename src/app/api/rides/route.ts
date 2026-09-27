import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { listRides, requestRide, RideError } from "@/lib/rides/rides";
import type { RidePoint } from "@/lib/rides/types";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ rides: await listRides(user.id) });
});

/** Orders the car from the chosen company. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ providerId?: string; optionId?: string; pickup?: RidePoint; dropoff?: RidePoint; phone?: string }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ ride: await requestRide(user, input) }, 201);
  } catch (e) {
    if (e instanceof RideError) return error(e.code, e.status);
    throw e;
  }
});
