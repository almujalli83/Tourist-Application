import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { autoSelect, ExecuteError, planExtras } from "@/lib/planner/execute";
import { getPlan } from "@/lib/planner/plans";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Carries out an approved plan: picks the package (flights, hotels, activities to the minimum
 * price) and prepares the plan's event tickets and table bookings. Nothing is bought here; the
 * traveller pays for everything at the end. `?extras=1` refreshes only the tickets and tables.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const plan = await getPlan(user.id, (await params).id);
  if (!plan) return error("notFound", 404);
  if (plan.status !== "draft") return error("locked", 409);
  const extras = await planExtras(plan);
  if (new URL(req.url).searchParams.get("extras") === "1") return json({ extras });
  try {
    const auto = await autoSelect(plan, extras.totalSAR);
    return json({ ...auto, extras });
  } catch (e) {
    if (e instanceof ExecuteError) return error(e.message.split(":")[0], 422, e.message.split(":")[1]?.split(","));
    throw e;
  }
});
