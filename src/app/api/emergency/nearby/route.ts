import { error, handle, json } from "@/lib/http";
import { nearbyPlaces, type NearbyKind } from "@/lib/emergency/nearby";

const KINDS: NearbyKind[] = ["hospital", "pharmacy", "police"];

/** Nearest hospitals, pharmacies or police stations: ?kind=hospital&lat=…&lng=… */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") as NearbyKind;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!KINDS.includes(kind)) return error("invalidKind", 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 15 || lat > 33 || lng < 34 || lng > 56) return error("invalidLocation", 400);
  return json({ places: await nearbyPlaces(kind, lat, lng) });
});
