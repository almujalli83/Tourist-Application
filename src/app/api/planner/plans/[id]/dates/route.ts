import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { PlanError } from "@/lib/planner/generate";
import { shiftPlanDates } from "@/lib/planner/plans";

type Ctx = { params: Promise<{ id: string }> };

/** { departureDate } → moves the draft plan to that arrival date, keeping its activities. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ departureDate?: string }>(req);
  try {
    return json(await shiftPlanDates(user, (await params).id, b?.departureDate, todayISO()));
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, e.message === "notFound" ? 404 : e.message === "locked" ? 409 : 422, e.fields);
    throw e;
  }
});
