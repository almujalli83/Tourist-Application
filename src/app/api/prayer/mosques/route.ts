import { error, handle, json } from "@/lib/http";
import { nearbyMosques } from "@/lib/prayer/mosques";

/** Mosques near a point: ?lat=24.71&lng=46.67 (within Saudi Arabia). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 15 || lat > 33 || lng < 34 || lng > 56) return error("invalidLocation", 400);
  return json({ mosques: await nearbyMosques(lat, lng) });
});
