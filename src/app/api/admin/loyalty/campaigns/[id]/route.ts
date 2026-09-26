import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { deleteCampaign, LoyaltyError, updateCampaign } from "@/lib/loyalty/loyalty";
import type { LoyaltyCampaign } from "@/lib/loyalty/types";

type Ctx = { params: Promise<{ id: string }> };

/** Back office: change a campaign (e.g. { active: false } to pause it). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const b = await body<Partial<LoyaltyCampaign>>(req);
  if (!b) return error("invalidRequest", 400);
  try {
    const c = await updateCampaign((await params).id, b);
    return c ? json({ campaign: c }) : error("notFound", 404);
  } catch (e) {
    if (e instanceof LoyaltyError) return error(e.code, e.status);
    throw e;
  }
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return (await deleteCampaign((await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
