import { currentUser } from "@/lib/auth/session";
import { familyTravellers } from "@/lib/family/family";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { sanitizeSavedTraveller, validateSavedTraveller } from "@/lib/saved-travellers";
import { createSavedTraveller, listSavedTravellers } from "@/lib/saved-travellers-repo";

/** The user's saved travellers; ?family=1 adds the ones family members share (read-only, "fam:" ids). */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const own = await listSavedTravellers(user.id);
  const family = new URL(req.url).searchParams.get("family") === "1" ? await familyTravellers(user.id) : [];
  return json({ travellers: [...own, ...family] });
});

export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const data = sanitizeSavedTraveller(await body(req));
  const fieldErrors = validateSavedTraveller(data, todayISO());
  if (Object.keys(fieldErrors).length) return error("invalidTraveller", 422, fieldErrors);
  const saved = await createSavedTraveller(user.id, data);
  return saved === "limit" ? error("savedLimit", 409) : json({ traveller: saved }, 201);
});
