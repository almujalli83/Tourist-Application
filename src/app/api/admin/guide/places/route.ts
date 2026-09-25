import { requireAdmin } from "@/lib/auth/admin";
import { adminListPlaces, createPlace, PlaceError } from "@/lib/guide/repo";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const q = new URL(req.url).searchParams;
  const places = await adminListPlaces({ city: q.get("city") || undefined, status: q.get("status") || undefined, q: q.get("q") || undefined });
  return json({ places });
});

export const POST = handle(async (req: Request) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return json({ place: await createPlace((await body<Record<string, unknown>>(req)) ?? {}) }, 201);
  } catch (e) {
    if (e instanceof PlaceError) return error(e.message, 422);
    throw e;
  }
});
