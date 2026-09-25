import { requireAdmin } from "@/lib/auth/admin";
import { deleteSeason, SeasonError, updateSeason } from "@/lib/events/seasons";
import { body, error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const season = await updateSeason((await params).id, (await body<Record<string, unknown>>(req)) ?? {});
    return season ? json({ season }) : error("notFound", 404);
  } catch (e) {
    if (e instanceof SeasonError) return error(e.message, 422);
    throw e;
  }
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return (await deleteSeason((await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
