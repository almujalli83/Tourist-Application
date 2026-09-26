import { aiConfigured } from "@/lib/assistant/claude";
import { quotaLeft, takeQuota, visitorKey } from "@/lib/assistant/usage";
import { currentUser } from "@/lib/auth/session";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { plannerCities } from "@/lib/planner/catalog";
import { generatePlan, PlanError } from "@/lib/planner/generate";
import { savePlan } from "@/lib/planner/plans";

export const maxDuration = 300;

/** Mode (Claude or rules), the cities plans can include and today's remaining plans. */
export const GET = handle(async (req: Request) => {
  const user = await currentUser();
  const [cities, remaining] = await Promise.all([plannerCities(), quotaLeft(user ? `user:${user.id}` : visitorKey(req), !!user, "planner")]);
  return json({ mode: aiConfigured() ? "live" : "sandbox", cities, remaining });
});

/** { request, locale } → a new plan (saved to the account when signed in). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  const b = await body<{ request?: unknown; locale?: string }>(req);
  if (!b?.request) return error("invalidBody");
  const quota = await takeQuota(user ? `user:${user.id}` : visitorKey(req), !!user, "planner");
  if (!quota.ok) return error("dailyLimit", 429);
  try {
    const { plan, warning } = await generatePlan(b.request, b.locale === "en" ? "en" : "ar", todayISO());
    const out = user ? await savePlan(user, plan) : { ...plan, id: null, userId: null };
    return json({ plan: out, warning: warning ?? null, remaining: quota.remaining });
  } catch (e) {
    if (e instanceof PlanError) return error(e.message, 422, e.fields);
    throw e;
  }
});
