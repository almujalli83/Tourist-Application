import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { PlanError } from "@/lib/planner/generate";
import { sharePlan, unsharePlan } from "@/lib/planner/plans";

type Ctx = { params: Promise<{ id: string }> };

/** Creates the plan's read-only share link. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ token: await sharePlan(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 404);
    throw e;
  }
});

/** Stops sharing (the link no longer works). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    await unsharePlan(user.id, (await params).id);
    return json({ ok: true });
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 404);
    throw e;
  }
});
