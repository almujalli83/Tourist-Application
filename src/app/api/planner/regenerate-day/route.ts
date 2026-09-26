import { takeQuota, visitorKey } from "@/lib/assistant/usage";
import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { PlanError, regenerateDay } from "@/lib/planner/generate";
import type { TripPlan } from "@/lib/planner/types";

export const maxDuration = 120;

/** { plan, date } → a new version of that day (the traveller then saves or keeps editing). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = await body<{ plan?: TripPlan; date?: string }>(req);
  if (!b?.plan?.request || !Array.isArray(b.plan.days) || typeof b.date !== "string") return error("invalidBody");
  if (b.plan.status === "booked") return error("locked", 409);
  const quota = await takeQuota(user ? `user:${user.id}` : visitorKey(req), !!user, "planner");
  if (!quota.ok) return error("dailyLimit", 429);
  try {
    const out = await regenerateDay({ request: b.plan.request, days: b.plan.days, locale: b.plan.locale === "en" ? "en" : "ar" }, b.date, todayISO());
    return json({ ...out, remaining: quota.remaining });
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 422, e.fields);
    throw e;
  }
});
