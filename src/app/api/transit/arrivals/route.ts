import { error, handle, json } from "@/lib/http";
import { liveArrivals, TransitError } from "@/lib/transit/transit";

/** Next trains and buses near a place (public). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  try {
    return json({ arrivals: await liveArrivals(q.get("city") ?? "RUH", { lat: q.get("lat"), lng: q.get("lng") }) });
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
