import { handle, json } from "@/lib/http";
import { suggestGuides } from "@/lib/guides/guides";

/** Guides for a trip (?cities=RUH,ULH&language=en&tracks=heritage,nature). */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const list = (k: string) => (q.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
  return json({ guides: await suggestGuides(list("cities").map((c) => c.toUpperCase()), q.get("language")?.trim() || null, list("tracks")) });
});
