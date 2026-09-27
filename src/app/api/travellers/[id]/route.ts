import { currentUser } from "@/lib/auth/session";
import { familyTraveller } from "@/lib/family/family";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { sanitizeSavedTraveller, validateSavedTraveller } from "@/lib/saved-travellers";
import { deleteSavedTraveller, getSavedTraveller, updateSavedTraveller } from "@/lib/saved-travellers-repo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const id = (await params).id;
  const traveller = id.startsWith("fam:") ? await familyTraveller(user.id, id) : await getSavedTraveller(user.id, id);
  return traveller ? json({ traveller }) : error("notFound", 404);
});

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const data = sanitizeSavedTraveller(await body(req));
  const fieldErrors = validateSavedTraveller(data, todayISO());
  if (Object.keys(fieldErrors).length) return error("invalidTraveller", 422, fieldErrors);
  const saved = await updateSavedTraveller(user.id, (await params).id, data);
  return saved ? json({ traveller: saved }) : error("notFound", 404);
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return (await deleteSavedTraveller(user.id, (await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
