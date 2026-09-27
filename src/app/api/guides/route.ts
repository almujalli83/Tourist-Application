import { handle, json } from "@/lib/http";
import { searchGuides } from "@/lib/guides/guides";

/** Directory of licensed guides (?city&language&track&gender&q). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const s = (k: string) => q.get(k)?.trim() || undefined;
  return json({ guides: await searchGuides({ city: s("city"), language: s("language"), track: s("track"), gender: s("gender"), q: s("q") }) });
});
