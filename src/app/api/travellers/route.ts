import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { sanitizeSavedTraveller, validateSavedTraveller } from "@/lib/saved-travellers";
import { createSavedTraveller, listSavedTravellers } from "@/lib/saved-travellers-repo";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ travellers: await listSavedTravellers(user.id) });
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
