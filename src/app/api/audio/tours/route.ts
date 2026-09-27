import { listTours } from "@/lib/audio/tours";
import { handle, json } from "@/lib/http";

/** Published audio tours: ?city=RUH, or ?place={guide place id} for the tours about a place. */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  return json({ tours: await listTours({ city: q.get("city") || undefined, placeId: q.get("place") || undefined }) });
});
