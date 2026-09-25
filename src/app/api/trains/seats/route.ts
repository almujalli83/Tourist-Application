import { error, handle, json } from "@/lib/http";
import { unavailableSeats } from "@/lib/trains/orders";
import { tripById } from "@/lib/trains/sar";

/** ?trip=…&cls=economy|business — unavailable seats on that train. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const trip = tripById(q.get("trip") ?? "");
  const cls = q.get("cls");
  if (!trip || (cls !== "economy" && cls !== "business")) return error("notFound", 404);
  return json({ unavailable: await unavailableSeats(trip.runId, cls) });
});
