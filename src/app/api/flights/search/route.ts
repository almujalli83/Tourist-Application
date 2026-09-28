import { error, handle, json } from "@/lib/http";
import { FlightError, searchStandaloneFlights } from "@/lib/standalone/flights";

/** ?from=&to=&date=&adults=&children=&infants=&cabin= — one flight leg from every agent. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  try {
    return json(await searchStandaloneFlights({
      from: q.get("from") ?? "", to: q.get("to") ?? "", date: q.get("date") ?? "", cabin: (q.get("cabin") ?? "economy") as never,
      pax: { adults: Number(q.get("adults") ?? 1), children: Number(q.get("children") ?? 0), infants: Number(q.get("infants") ?? 0) },
    }));
  } catch (e) {
    if (e instanceof FlightError) return error(e.code, e.status);
    throw e;
  }
});
