/** Verified ratings and reviews (service 9): shared types (no server-only imports). */

export const REVIEW_TARGETS = ["package", "hotel", "airline", "event", "restaurant", "place", "service"] as const;
export type ReviewTarget = (typeof REVIEW_TARGETS)[number];

/** Saudi Trip services that travellers rate once they've used them. */
export const SERVICES = ["packageVisa", "planner", "events", "restaurants", "trains", "esim", "assistant"] as const;
export type ServiceId = (typeof SERVICES)[number];

/** Detailed criteria rated (1–5, optional) for each kind of review. */
export const CRITERIA: Record<ReviewTarget, readonly string[]> = {
  package: ["organisation", "value", "accuracy"],
  hotel: ["cleanliness", "location", "service", "value"],
  airline: ["punctuality", "comfort", "service"],
  event: ["organisation", "experience", "value"],
  restaurant: ["food", "service", "ambience", "value"],
  place: ["experience", "facilities", "access"],
  service: ["ease", "speed", "clarity"],
};

export const MAX_COMMENT = 1000;
export const MAX_PHOTOS = 3;
/** After resizing in the browser (keeps the request under the hosting body limit). */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/** Ratings at or below this offer the Ministry of Tourism's complaint service. */
export const COMPLAINT_MAX_RATING = 2;

export type ReviewStatus = "published" | "pending" | "rejected";
/** Why a review waits for (or failed) moderation. */
export type ModerationReason = "personalData" | "language" | "photos" | "offTopic" | "spam" | "admin";

export interface ReviewPhoto {
  id: string;
  contentType: string;
}

/** A review as shown to the public (no account details). */
export interface PublicReview {
  id: string;
  targetType: ReviewTarget;
  targetId: string;
  targetNameAr: string;
  targetNameEn: string;
  authorName: string;
  authorCountry: string | null;
  rating: number;
  criteria: Record<string, number>;
  comment: string;
  lang: "ar" | "en" | "other";
  translation: { ar?: string; en?: string };
  photos: ReviewPhoto[];
  reply: { text: string; at: string; byAr: string; byEn: string } | null;
  createdAt: string;
  /** Sample data (sandbox) — labelled as such. */
  demo?: boolean;
}

export interface ReviewSummary {
  avg: number;
  count: number;
  /** Number of reviews with 1…5 stars (index 0 = 1 star). */
  distribution: [number, number, number, number, number];
  /** Average of each detailed criterion rated. */
  criteria: Record<string, number>;
}

/** Something the signed-in traveller can rate (a verified experience). */
export interface ReviewableItem {
  /** Unique per traveller: one review per target and booking. */
  key: string;
  targetType: ReviewTarget;
  targetId: string;
  nameAr: string;
  nameEn: string;
  /** Where the experience comes from (booking reference…). */
  sourceAr: string;
  sourceEn: string;
  eligibleAt: string;
  demo?: boolean;
}

export const emptySummary = (): ReviewSummary => ({ avg: 0, count: 0, distribution: [0, 0, 0, 0, 0], criteria: {} });

/** Averages of a list of ratings (rounded to one decimal). */
export function summarize(reviews: Pick<PublicReview, "rating" | "criteria">[]): ReviewSummary {
  const s = emptySummary();
  if (!reviews.length) return s;
  const sums: Record<string, [number, number]> = {};
  let total = 0;
  for (const r of reviews) {
    total += r.rating;
    s.distribution[r.rating - 1]++;
    for (const [k, v] of Object.entries(r.criteria)) {
      const e = (sums[k] ??= [0, 0]);
      e[0] += v;
      e[1]++;
    }
  }
  s.count = reviews.length;
  s.avg = Math.round((total / reviews.length) * 10) / 10;
  for (const [k, [sum, n]] of Object.entries(sums)) s.criteria[k] = Math.round((sum / n) * 10) / 10;
  return s;
}
