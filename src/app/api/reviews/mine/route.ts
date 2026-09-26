import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { complaintsUrl, myReviews, pendingReviews } from "@/lib/reviews/reviews";

/** The traveller's experiences to rate and the reviews already given. */
export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const [pending, reviews] = await Promise.all([pendingReviews(user), myReviews(user.id)]);
  return json({ pending, reviews, complaintsUrl: complaintsUrl() });
});
