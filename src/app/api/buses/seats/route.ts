import { error, handle, json } from "@/lib/http";
import { busSeatMap, BusOrderError } from "@/lib/buses/orders";

/** A trip's seat map with the seats already taken (public). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  try {
    return json({ seats: await busSeatMap(String(q.get("providerId") ?? ""), String(q.get("tripId") ?? "")) });
  } catch (e) {
    if (e instanceof BusOrderError) return error(e.code, e.status);
    throw e;
  }
});
