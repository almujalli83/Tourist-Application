import { takeQuota, visitorKey } from "@/lib/assistant/usage";
import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { chatEditPlan, MAX_CHAT_CHARS, PlanError } from "@/lib/planner/generate";
import type { TripPlan } from "@/lib/planner/types";

export const maxDuration = 120;

/** { plan, message } → the assistant's reply and the plan's new days (the traveller's page saves them). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = await body<{ plan?: TripPlan; message?: string }>(req);
  if (!b?.plan?.request || !Array.isArray(b.plan.days) || typeof b.message !== "string" || b.message.length > MAX_CHAT_CHARS) return error("invalidBody");
  if (b.plan.status === "booked") return error("locked", 409);
  const quota = await takeQuota(user ? `user:${user.id}` : visitorKey(req), !!user, "planner");
  if (!quota.ok) return error("dailyLimit", 429);
  try {
    const out = await chatEditPlan({ ...b.plan, locale: b.plan.locale === "en" ? "en" : "ar" }, b.message, todayISO());
    return json({ ...out, remaining: quota.remaining });
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 422, e.fields);
    throw e;
  }
});
