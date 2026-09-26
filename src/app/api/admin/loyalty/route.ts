import { requireAdmin } from "@/lib/auth/admin";
import { handle, json } from "@/lib/http";
import { listCampaigns, loyaltyOverview } from "@/lib/loyalty/loyalty";

/** Back office: programme figures, points outstanding, recent adjustments and campaigns. */
export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const [overview, campaigns] = await Promise.all([loyaltyOverview(), listCampaigns()]);
  return json({ overview, campaigns });
});
