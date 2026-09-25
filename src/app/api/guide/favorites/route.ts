import { currentUser } from "@/lib/auth/session";
import { changeFavorites, getFavorites } from "@/lib/guide/repo";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ ids: await getFavorites(user.id) });
});

/** { add?: string[], remove?: string[] } */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ add?: unknown; remove?: unknown }>(req);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return json({ ids: await changeFavorites(user.id, list(b?.add), list(b?.remove)) });
});
