import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { complaintsUrl, isTarget, ReviewError, submitReview, targetReviews, type ReviewInput } from "@/lib/reviews/reviews";

/** Published reviews of a target: ?type=restaurant&id=…&offset=0&rating=5 */
export const GET = handle(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const type = q.get("type");
  const id = q.get("id")?.trim();
  if (!isTarget(type) || !id) return error("invalidTarget", 400);
  const rating = Number(q.get("rating"));
  return json(await targetReviews(type, id, { offset: Math.max(0, Number(q.get("offset")) || 0), limit: 10, rating: rating >= 1 && rating <= 5 ? rating : undefined }));
});

/** Rates an experience of the signed-in traveller. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<ReviewInput>(req);
  if (!input) return error("invalidBody", 400);
  try {
    const out = await submitReview(user, input);
    return json({ ...out, complaintsUrl: complaintsUrl() }, 201);
  } catch (err) {
    if (err instanceof ReviewError) return error(err.code, err.status);
    throw err;
  }
});
