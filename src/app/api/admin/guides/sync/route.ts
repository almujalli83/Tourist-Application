import { requireAdmin } from "@/lib/auth/admin";
import { error, handle, json } from "@/lib/http";
import { expireGuideRequests } from "@/lib/guides/bookings";
import { syncGuidesFromMt } from "@/lib/guides/guides";

/** Runs the Ministry of Tourism sync now (needs MT_GUIDES_URL). */
export const POST = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  try {
    const result = await syncGuidesFromMt();
    if (!result) return error("notConfigured", 400);
    await expireGuideRequests();
    return json({ result });
  } catch {
    return error("syncFailed", 502);
  }
});
