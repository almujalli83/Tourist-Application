import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { getLicenceRules, setLicenceRules } from "@/lib/rentals/licence";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ licence: await getLicenceRules() });
});

/** Saves the driving-licence requirements (and marks them reviewed). */
export const PUT = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const input = await body<{ rules?: unknown; sourceUrl?: unknown; reviewed?: unknown }>(req);
  try {
    return json({ licence: await setLicenceRules(input ?? {}, a.user.email) });
  } catch (e) {
    return error(e instanceof Error ? e.message : "invalidRules", 400);
  }
});
