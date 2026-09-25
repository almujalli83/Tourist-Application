import { todayISO } from "@/lib/dates";
import { handle, json } from "@/lib/http";
import { SALES_CLOSE_MINUTES, unavailableSeats } from "@/lib/trains/orders";
import { allSeats, searchTrips } from "@/lib/trains/sar";

/** ?from=JSL&to=MDN&date=YYYY-MM-DD — trips on sale with seats left per class. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const now = Date.now();
  const trips = searchTrips(q.get("from") ?? "", q.get("to") ?? "", q.get("date") ?? "", todayISO())
    .filter((t) => Date.parse(t.depart) - now >= SALES_CLOSE_MINUTES * 60_000);
  const withSeats = await Promise.all(
    trips.map(async (t) => ({
      ...t,
      seatsLeft: {
        economy: allSeats("economy").length - (await unavailableSeats(t.runId, "economy")).length,
        business: allSeats("business").length - (await unavailableSeats(t.runId, "business")).length,
      },
    })),
  );
  return json({ trips: withSeats });
});
