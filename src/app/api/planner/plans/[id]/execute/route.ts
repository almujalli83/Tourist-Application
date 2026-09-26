import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { autoSelect, ExecuteError, holdPlanExtras, planExtras } from "@/lib/planner/execute";
import { getPlan } from "@/lib/planner/plans";

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Carries out an approved plan: picks the package (flights, hotels, activities to the minimum
 * price), fits the days to the chosen flights and holds the plan's seats and tables for a while.
 * Nothing is bought here; the traveller pays for everything at the end. When a date of the plan
 * has no flights, nearby dates are returned for the traveller to choose (`noFlights`).
 */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const plan = await getPlan(user.id, (await params).id);
  if (!plan) return error("notFound", 404);
  if (plan.status !== "draft") return error("locked", 409);
  try {
    const estimate = await planExtras(plan, new Date(), { userId: user.id });
    const auto = await autoSelect(plan, estimate.totalSAR);
    const extras = await holdPlanExtras(user, await planExtras(plan, new Date(), { flights: auto.flightTimes, userId: user.id }));
    return json({ ...auto, extras });
  } catch (e) {
    if (e instanceof ExecuteError) return error(e.message.split(":")[0], 422, e.details ?? e.message.split(":")[1]?.split(","));
    throw e;
  }
});
