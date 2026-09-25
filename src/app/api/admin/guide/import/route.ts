import { requireAdmin } from "@/lib/auth/admin";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fetchOfficialPlaces, officialGuideConfigured, OfficialGuideError } from "@/lib/guide/official";
import { fetchOsmPlaces } from "@/lib/guide/osm";
import { addImportedPlaces } from "@/lib/guide/repo";
import { body, error, handle, json } from "@/lib/http";

export const maxDuration = 90;

export const GET = handle(async () => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return json({ official: officialGuideConfigured() });
});

/** { city, source: "osm" | "official" } — imported places are added as drafts. */
export const POST = handle(async (req: Request) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const b = await body<{ city?: string; source?: string }>(req);
  const city = (b?.city ?? "").toUpperCase();
  if (!SAUDI_CITIES.some((c) => c.code === city)) return error("invalidCity", 400);
  if (b?.source === "official" && !officialGuideConfigured()) return error("notConfigured", 409);
  try {
    const items = b?.source === "official" ? await fetchOfficialPlaces(city) : await fetchOsmPlaces(city);
    return json({ found: items.length, ...(await addImportedPlaces(city, items)) });
  } catch (e) {
    console.error("guide import failed", e);
    return error(e instanceof OfficialGuideError && e.message === "notConfigured" ? "notConfigured" : "sourceUnavailable", 502);
  }
});
