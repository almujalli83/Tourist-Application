import { requireAdmin } from "@/lib/auth/admin";
import { createSeason, listSeasons, SeasonError } from "@/lib/events/seasons";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return json({ seasons: await listSeasons(true) });
});

export const POST = handle(async (req: Request) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return json({ season: await createSeason((await body<Record<string, unknown>>(req)) ?? {}) }, 201);
  } catch (e) {
    if (e instanceof SeasonError) return error(e.message, 422);
    throw e;
  }
});
