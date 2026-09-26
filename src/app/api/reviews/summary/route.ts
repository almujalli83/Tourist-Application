import { error, handle, json } from "@/lib/http";
import { isTarget, summaries } from "@/lib/reviews/reviews";

/** Rating summaries of several targets of one kind: ?type=hotel&ids=a,b,c */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const type = q.get("type");
  if (!isTarget(type)) return error("invalidTarget", 400);
  const ids = (q.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return json({ summaries: await summaries(type, ids) });
});
