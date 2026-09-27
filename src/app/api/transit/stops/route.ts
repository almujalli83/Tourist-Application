import { error, handle, json } from "@/lib/http";
import { TransitError, transitStops } from "@/lib/transit/transit";

/** Stations and stops of a city's network (public). */
export const GET = handle(async (req: Request) => {
  try {
    return json({ stops: await transitStops(new URL(req.url).searchParams.get("city") ?? "RUH") });
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
