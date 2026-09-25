import { requireAdmin } from "@/lib/auth/admin";
import { deletePlace, PlaceError, updatePlace } from "@/lib/guide/repo";
import { body, error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const place = await updatePlace((await params).id, (await body<Record<string, unknown>>(req)) ?? {});
    return place ? json({ place }) : error("notFound", 404);
  } catch (e) {
    if (e instanceof PlaceError) return error(e.message, 422);
    throw e;
  }
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return (await deletePlace((await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
