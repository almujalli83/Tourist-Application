import { error, handle, json } from "@/lib/http";
import { BusOrderError, searchBuses } from "@/lib/buses/orders";

/** Intercity bus trips (public). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  try {
    return json({ trips: await searchBuses(String(q.get("from") ?? "").toUpperCase(), String(q.get("to") ?? "").toUpperCase(), String(q.get("date") ?? "")) });
  } catch (e) {
    if (e instanceof BusOrderError) return error(e.code, e.status);
    throw e;
  }
});
