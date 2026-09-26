import { error, handle, json } from "@/lib/http";
import { reverseAddress } from "@/lib/emergency/nearby";

/** Nearest address of a point: ?lat=…&lng=…&locale=ar */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return error("invalidLocation", 400);
  return json({ address: await reverseAddress(lat, lng, q.get("locale") === "en" ? "en" : "ar") });
});
