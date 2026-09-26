/** Published reviews and rating summaries (no dependency on bookings or the planner). */
import type { StoredFileRef } from "../files";
import { store } from "../store";
import { demoReviewsEnabled, demoReviewsFor } from "./demo";
import { emptySummary, REVIEW_TARGETS, summarize, type ModerationReason, type PublicReview, type ReviewStatus, type ReviewSummary, type ReviewTarget } from "./types";

const COL = "reviews" as const;

export interface StoredReview extends Omit<PublicReview, "photos"> {
  userId: string;
  key: string;
  /** Booking / order reference the experience comes from. */
  sourceRef: string;
  photos: (PublicReview["photos"][number] & { ref: StoredFileRef })[];
  status: ReviewStatus;
  moderation: { by: "auto" | "ai" | "admin"; reason: ModerationReason | null; note: string | null; at: string };
  publishedAt: string | null;
}

export function toPublic(r: StoredReview): PublicReview {
  return {
    id: r.id, targetType: r.targetType, targetId: r.targetId, targetNameAr: r.targetNameAr, targetNameEn: r.targetNameEn,
    authorName: r.authorName, authorCountry: r.authorCountry, rating: r.rating, criteria: r.criteria, comment: r.comment, lang: r.lang,
    translation: r.translation, photos: r.photos.map(({ id, contentType }) => ({ id, contentType })), reply: r.reply, createdAt: r.createdAt,
    ...(r.demo ? { demo: true } : {}),
  };
}

export async function publishedOf(type: ReviewTarget): Promise<StoredReview[]> {
  return (await store().findBy<StoredReview>(COL, "targetType", type)).filter((r) => r.status === "published");
}

export function withDemo(type: ReviewTarget, id: string, real: PublicReview[]): PublicReview[] {
  const all = demoReviewsEnabled() ? [...real, ...demoReviewsFor(type, id)] : real;
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function isTarget(type: unknown): type is ReviewTarget {
  return typeof type === "string" && (REVIEW_TARGETS as readonly string[]).includes(type);
}

/** Published reviews of one target, newest first, with its summary. */
export async function targetReviews(type: ReviewTarget, id: string, opts: { limit?: number; offset?: number; rating?: number } = {}) {
  const all = withDemo(type, id, (await publishedOf(type)).filter((r) => r.targetId === id).map(toPublic));
  const filtered = opts.rating ? all.filter((r) => r.rating === opts.rating) : all;
  const offset = opts.offset ?? 0;
  const limit = Math.min(opts.limit ?? 10, 50);
  return { summary: summarize(all), total: filtered.length, reviews: filtered.slice(offset, offset + limit) };
}

/** Summaries of several targets of one kind (lists: hotels, restaurants, events…). */
export async function summaries(type: ReviewTarget, ids: string[]): Promise<Record<string, ReviewSummary>> {
  const real = await publishedOf(type);
  const out: Record<string, ReviewSummary> = {};
  for (const id of [...new Set(ids)].slice(0, 200)) {
    const list = withDemo(type, id, real.filter((r) => r.targetId === id).map(toPublic));
    out[id] = list.length ? summarize(list) : emptySummary();
  }
  return out;
}

