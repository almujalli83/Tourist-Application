import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { PlanError } from "@/lib/planner/generate";
import { deletePlan, getPlan, updatePlanDays } from "@/lib/planner/plans";

type Ctx = { params: Promise<{ id: string }> };

const fail = (e: unknown) => {
  if (e instanceof PlanError) return error(e.message, e.message === "notFound" ? 404 : e.message === "locked" ? 409 : 422, e.fields);
  throw e;
};

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const plan = await getPlan(user.id, (await params).id);
  return plan ? json({ plan }) : error("notFound", 404);
});

/** { days } → saves the traveller's edits (drafts only). */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ days?: unknown }>(req);
  if (!Array.isArray(b?.days)) return error("invalidBody");
  try {
    return json({ plan: await updatePlanDays(user, (await params).id, b.days) });
  } catch (e) {
    return fail(e);
  }
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    await deletePlan(user.id, (await params).id);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
});
