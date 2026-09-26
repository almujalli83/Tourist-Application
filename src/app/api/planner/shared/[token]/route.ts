import { error, handle, json } from "@/lib/http";
import { getSharedPlan } from "@/lib/planner/plans";

/** A plan shared by its owner (read-only, no account or booking details). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const plan = await getSharedPlan((await params).token);
  return plan ? json({ plan }) : error("notFound", 404);
});
