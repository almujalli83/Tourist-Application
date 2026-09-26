import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { seedDemoLoyalty } from "@/lib/loyalty/demo";
import { loyaltySummary } from "@/lib/loyalty/loyalty";

/** The member's points (available, pending, tier, expiring) and their history, newest first. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  await seedDemoLoyalty(user);
  return json(await loyaltySummary(user));
});
