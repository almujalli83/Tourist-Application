import { SAUDI_CITIES } from "@/lib/data/cities";
import { publishedPlaces, publishedPlacesByIds } from "@/lib/guide/repo";
import { error, handle, json } from "@/lib/http";

/** Published guide places of a city (?city=RUH) or by id (?ids=a,b — favourites). */
export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  if (ids !== null) return json({ places: await publishedPlacesByIds(ids.split(",").filter(Boolean)) });
  const city = (url.searchParams.get("city") ?? "").toUpperCase();
  if (!SAUDI_CITIES.some((c) => c.code === city)) return error("invalidCity", 400);
  return json({ places: await publishedPlaces(city) });
});
