import { requireAdmin } from "@/lib/auth/admin";
import { handle, json } from "@/lib/http";
import { adminReviews, adminReviewStats } from "@/lib/reviews/reviews";

/** Back office: reviews by status (?status=pending|published|rejected|all) and statistics. */
export const GET = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const s = new URL(req.url).searchParams.get("status");
  const status = s === "published" || s === "rejected" || s === "all" ? s : "pending";
  const [reviews, stats] = await Promise.all([adminReviews(status), adminReviewStats()]);
  return json({ reviews, stats });
});
