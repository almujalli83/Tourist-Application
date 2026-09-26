import { handle, json } from "@/lib/http";
import { serviceRatings } from "@/lib/reviews/reviews";

/** Ratings of the Saudi Trip services (public). */
export const GET = handle(async () => json(await serviceRatings()));
