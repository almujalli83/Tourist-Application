import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { createCampaign, LoyaltyError } from "@/lib/loyalty/loyalty";
import type { LoyaltyCampaign } from "@/lib/loyalty/types";

/** Back office: new points campaign (multiplier over dates, optionally by service and city). */
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const b = await body<Partial<LoyaltyCampaign>>(req);
  if (!b) return error("invalidRequest", 400);
  try {
    return json({ campaign: await createCampaign(a.user, b) }, 201);
  } catch (e) {
    if (e instanceof LoyaltyError) return error(e.code, e.status);
    throw e;
  }
});
