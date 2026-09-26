import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { PlanError } from "@/lib/planner/generate";
import { importPlan, listPlans } from "@/lib/planner/plans";

/** The account's saved plans (newest first). */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const plans = await listPlans(user.id);
  return json({
    plans: plans.map((p) => ({ id: p.id, createdAt: p.createdAt, updatedAt: p.updatedAt, departureDate: p.request.departureDate, returnDate: p.returnDate, stays: p.stays, status: p.status, bookingReference: p.bookingReference ?? null, totalSAR: p.budget.totalSAR })),
  });
});

/** Saves a plan made before signing in. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ plan?: unknown }>(req);
  if (!b?.plan) return error("invalidBody");
  try {
    return json({ plan: await importPlan(user, b.plan, todayISO()) }, 201);
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 422, e.fields);
    throw e;
  }
});
