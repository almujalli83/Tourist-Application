import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { getUmrahSeason, setUmrahSeason } from "@/lib/umrah/season";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ season: await getUmrahSeason() });
});

/** Sets (or clears, with empty dates) the Umrah permit pause for the Hajj season. */
export const PUT = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const input = await body<{ pauseFrom?: string; pauseTo?: string }>(req);
  try {
    return json({ season: await setUmrahSeason(input ?? {}, a.user.email) });
  } catch {
    return error("invalidDates", 400);
  }
});
