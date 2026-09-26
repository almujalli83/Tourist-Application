/**
 * Service 9 — verified ratings and reviews.
 *
 * Only travellers with a confirmed booking (or who used a service) can rate, once per experience:
 * the trip package, its hotels (by MT licence), airlines, the places of its trip plan, event
 * tickets, restaurant tables and the Saudi Trip services. Ratings are 1–5 stars with optional
 * criteria, comment and photos. Comments are checked before publishing (personal data, language —
 * by Claude when configured, which also translates between Arabic and English); photos and doubtful
 * comments wait for the back office. The establishment's (or Saudi Trip's) official reply can be
 * added by the back office. Low ratings point to the Ministry of Tourism's complaint service.
 */
import { createHash, randomUUID } from "node:crypto";
import type { PublicUser, StoredUser } from "../auth/types";
import type { StoredBooking } from "../bookings/types";
import { cityName } from "../data/cities";
import { addDays } from "../dates";
import { listEsimOrders } from "../esim/orders";
import { listOrders as listEventOrders } from "../events/orders";
import { readFile, saveFile } from "../files";
import { notifyTravellers } from "../notify";
import { listPlans, planForBooking } from "../planner/plans";
import { listBookingsByUser, getUserById } from "../repo";
import { listTableBookings } from "../restaurants/bookings";
import { store } from "../store";
import { listTrainOrders } from "../trains/orders";
import { aiConfigured, askClaude } from "../assistant/claude";
import type { AppNotification } from "../reminders/reminders";
import { demoReviewableItems, demoReviewsEnabled } from "./demo";
import { isTarget, publishedOf, summaries, targetReviews, toPublic, withDemo, type StoredReview } from "./summaries";
import {
  COMPLAINT_MAX_RATING, CRITERIA, MAX_COMMENT, MAX_PHOTO_BYTES, MAX_PHOTOS, REVIEW_TARGETS, SERVICES, summarize,
  type ModerationReason, type PublicReview, type ReviewableItem, type ReviewStatus, type ReviewSummary, type ReviewTarget, type ServiceId,
} from "./types";

export { isTarget, summaries, targetReviews, toPublic, type StoredReview };

const COL = "reviews" as const;


export class ReviewError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}

/** The Ministry of Tourism's complaint service (configurable). */
export const complaintsUrl = () => process.env.MOT_COMPLAINTS_URL?.trim() || "https://mt.gov.sa/about/complaints-guide";

const ksa = (local: string) => new Date(`${local}+03:00`).toISOString();
const addMinutes = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString();

/* ------------------------------------------------------------ eligibility */

const SERVICE_NAMES: Record<ServiceId, [string, string]> = {
  packageVisa: ["خدمة الباقات السياحية والتأشيرة", "Tourism package & visa service"],
  planner: ["مخطط الرحلة الذكي", "Smart trip planner"],
  events: ["خدمة تذاكر الفعاليات", "Event tickets service"],
  restaurants: ["خدمة حجز المطاعم", "Restaurant booking service"],
  trains: ["خدمة تذاكر القطار", "Train tickets service"],
  esim: ["خدمة شريحة eSIM", "eSIM service"],
  assistant: ["المساعد الذكي", "Smart assistant"],
};
export const serviceName = (s: ServiceId, locale: "ar" | "en") => SERVICE_NAMES[s][locale === "ar" ? 0 : 1];

function tripName(b: Pick<StoredBooking, "criteria">): [string, string] {
  const cities = [...new Set(b.criteria.stays.map((s) => s.city))];
  return [`رحلة ${cities.map((c) => cityName(c, "ar")).join(" و")}`, `Trip to ${cities.map((c) => cityName(c, "en")).join(" & ")}`];
}

/** Every experience of the traveller that can be rated (reviewed or not, eligible now or later). */
async function experiences(user: Pick<StoredUser, "id">): Promise<ReviewableItem[]> {
  const out: ReviewableItem[] = [];
  const firstUse = new Map<ServiceId, string>();
  const used = (s: ServiceId, at: string) => {
    if (!firstUse.has(s) || at < firstUse.get(s)!) firstUse.set(s, at);
  };

  for (const b of await listBookingsByUser(user.id)) {
    if (b.status === "CANCELLED" || b.mt.packageStatus === "CANCELLED") continue;
    used("packageVisa", b.createdAt);
    const after = ksa(`${addDays(b.criteria.returnDate, 1)}T09:00:00`);
    const [tripAr, tripEn] = tripName(b);
    const src = { sourceAr: `باقة ${b.reference}`, sourceEn: `Package ${b.reference}` };
    const add = (targetType: ReviewTarget, targetId: string, nameAr: string, nameEn: string, eligibleAt = after) =>
      out.push({ key: `${targetType}:${targetId}:${b.id}`, targetType, targetId, nameAr, nameEn, ...src, eligibleAt });
    add("package", b.id, tripAr, tripEn);
    const hotels = new Set<string>();
    for (const h of b.hotels) {
      if (!h.licenseNo || hotels.has(h.licenseNo)) continue;
      hotels.add(h.licenseNo);
      add("hotel", h.licenseNo, h.nameAr, h.nameEn, ksa(`${h.checkOut}T13:00:00`));
    }
    const carriers = new Set<string>();
    for (const f of b.flights) {
      if (carriers.has(f.carrierCode)) continue;
      carriers.add(f.carrierCode);
      add("airline", f.carrierCode, f.carrierNameAr, f.carrierNameEn, ksa(`${f.arriveAt}:00`));
    }
    const plan = await planForBooking(user.id, b.id);
    const places = new Set<string>();
    for (const d of plan?.days ?? []) {
      for (const it of d.items) {
        if (it.kind !== "place" || places.has(it.ref)) continue;
        places.add(it.ref);
        add("place", it.ref.slice("place:".length), it.titleAr, it.titleEn, ksa(`${d.date}T21:00:00`));
      }
    }
  }
  for (const o of await listEventOrders(user.id)) {
    if (o.status !== "CONFIRMED") continue;
    used("events", o.createdAt);
    out.push({
      key: `event:${o.event.id}:${o.id}`, targetType: "event", targetId: o.event.id, nameAr: o.event.titleAr, nameEn: o.event.titleEn,
      sourceAr: `تذكرة ${o.reference}`, sourceEn: `Ticket ${o.reference}`, eligibleAt: addMinutes(o.session.start, o.event.durationMins + 60),
    });
  }
  for (const r of await listTableBookings(user.id)) {
    if (r.status !== "CONFIRMED") continue;
    used("restaurants", r.createdAt);
    out.push({
      key: `restaurant:${r.restaurant.id}:${r.id}`, targetType: "restaurant", targetId: r.restaurant.id, nameAr: r.restaurant.nameAr, nameEn: r.restaurant.nameEn,
      sourceAr: `حجز طاولة ${r.reference}`, sourceEn: `Table ${r.reference}`, eligibleAt: addMinutes(r.start, 180),
    });
  }
  for (const o of await listTrainOrders(user.id)) if (o.status === "CONFIRMED") used("trains", o.createdAt);
  for (const o of await listEsimOrders(user.id)) if (o.status === "CONFIRMED") used("esim", o.createdAt);
  for (const p of await listPlans(user.id)) used("planner", p.createdAt);
  const chat = await store().get<{ messages: { at: string }[] }>("chats", user.id);
  if (chat && chat.messages.length >= 2) used("assistant", chat.messages[0].at);
  // Each service is rated once, after its first use.
  for (const [s, at] of firstUse) {
    out.push({
      key: `service:${s}:${user.id}`, targetType: "service", targetId: s, nameAr: SERVICE_NAMES[s][0], nameEn: SERVICE_NAMES[s][1],
      sourceAr: "خدمات سعودي تريب", sourceEn: "Saudi Trip services", eligibleAt: addMinutes(at, 5),
    });
  }
  return out;
}

const reviewId = (userId: string, key: string) => createHash("sha256").update(`${userId}|${key}`).digest("hex").slice(0, 24);

/** The traveller's experiences waiting for a rating (eligible now, not yet rated). */
export async function pendingReviews(user: Pick<StoredUser, "id">, now = new Date()): Promise<ReviewableItem[]> {
  const done = new Set((await store().findBy<StoredReview>(COL, "userId", user.id)).map((r) => r.key));
  const items = (await experiences(user)).filter((i) => i.eligibleAt <= now.toISOString() && !done.has(i.key));
  if (demoReviewsEnabled()) for (const i of await demoReviewableItems()) if (!done.has(i.key)) items.push(i);
  return items.sort((a, b) => Number(!!a.demo) - Number(!!b.demo) || b.eligibleAt.localeCompare(a.eligibleAt));
}

/* ------------------------------------------------------------- moderation */

const PERSONAL = [/[\w.+-]+@[\w-]+\.[\w.]{2,}/, /(?:\+?\d[\s-]?){8,}/, /https?:\/\/|www\./i];
const OFFENSIVE = [/\b(fuck|shit|bitch|bastard|idiot)\b/i, /(?:كلب|حمار|حقير|تافه|غبي)/];

interface Moderated { status: ReviewStatus; by: "auto" | "ai"; reason: ModerationReason | null; lang: PublicReview["lang"]; translation: PublicReview["translation"] }

const MODERATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decision", "reason", "language", "translation_ar", "translation_en"],
  properties: {
    decision: { type: "string", enum: ["publish", "review", "reject"] },
    reason: { type: "string", enum: ["none", "personalData", "language", "offTopic", "spam"] },
    language: { type: "string", enum: ["ar", "en", "other"] },
    translation_ar: { type: "string" },
    translation_en: { type: "string" },
  },
};

const MODERATION_SYSTEM = `You moderate traveller reviews for Saudi Trip, a tourism platform licensed with the Saudi Ministry of Tourism. Reviews are fair opinions: negative reviews MUST be published when they describe the experience, even if harsh.
Decide:
- "publish": a genuine opinion about the rated experience.
- "review" (a person checks it): it contains personal data (phone numbers, emails, full names of staff, booking numbers), or is doubtful.
- "reject": insults, hate, obscene or discriminatory language, spam, advertising, or text unrelated to the experience.
Give the reason ("none" when publishing), the language, and a faithful translation into Arabic and into English (return the text unchanged for its own language).`;

export async function moderateComment(comment: string, photos: number): Promise<Moderated> {
  const lang: PublicReview["lang"] = !comment ? "other" : /[؀-ۿ]/.test(comment) ? "ar" : /[A-Za-z]/.test(comment) ? "en" : "other";
  let status: ReviewStatus = "published";
  let reason: ModerationReason | null = null;
  let translation: PublicReview["translation"] = {};
  let by: Moderated["by"] = "auto";
  if (comment) {
    if (PERSONAL.some((re) => re.test(comment))) [status, reason] = ["pending", "personalData"];
    else if (OFFENSIVE.some((re) => re.test(comment))) [status, reason] = ["pending", "language"];
    if (aiConfigured()) {
      try {
        const out = await askClaude({
          system: [{ type: "text", text: MODERATION_SYSTEM }],
          messages: [{ role: "user", content: comment }],
          maxTokens: 2500,
          schema: MODERATION_SCHEMA,
        });
        if (out) {
          const r = JSON.parse(out) as { decision: string; reason: string; language: PublicReview["lang"]; translation_ar: string; translation_en: string };
          by = "ai";
          translation = { ar: r.translation_ar.slice(0, 2 * MAX_COMMENT), en: r.translation_en.slice(0, 2 * MAX_COMMENT) };
          if (r.decision === "reject") [status, reason] = ["rejected", r.reason === "none" ? "language" : (r.reason as ModerationReason)];
          else if (r.decision === "review" && status === "published") [status, reason] = ["pending", r.reason === "none" ? "offTopic" : (r.reason as ModerationReason)];
        }
      } catch (err) {
        // Claude unavailable: the rules above decide, and the text is shown untranslated.
        console.warn("[reviews] moderation unavailable", (err as Error).message);
      }
    }
  }
  if (photos && status === "published") [status, reason] = ["pending", "photos"];
  return { status, by, reason, lang, translation };
}

/* ----------------------------------------------------------------- submit */

export interface ReviewInput {
  key: unknown;
  rating: unknown;
  criteria?: unknown;
  comment?: unknown;
  photos?: unknown;
}

function authorOf(user: PublicUser): { name: string; country: string | null } {
  if (user.accountType === "company") return { name: user.company?.companyName ?? "—", country: "SA" };
  const parts = (user.individual?.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const name = parts.length ? `${parts[0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : ""}` : "—";
  return { name, country: user.individual?.nationality ?? null };
}

function parsePhotos(input: unknown): { data: Buffer; contentType: string }[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_PHOTOS) throw new ReviewError("photos", 400);
  return input.map((p) => {
    const m = typeof p === "string" ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(p) : null;
    if (!m) throw new ReviewError("photos", 400);
    const data = Buffer.from(m[2], "base64");
    if (data.length > MAX_PHOTO_BYTES) throw new ReviewError("photoTooLarge", 400);
    return { data, contentType: m[1] };
  });
}

export async function submitReview(user: PublicUser, input: ReviewInput, now = new Date()): Promise<{ review: PublicReview & { status: ReviewStatus; moderationReason: ModerationReason | null }; complaint: boolean }> {
  const item = (await pendingReviews(user, now)).find((i) => i.key === input.key);
  if (!item) {
    const done = typeof input.key === "string" && (await store().get(COL, reviewId(user.id, input.key)));
    throw new ReviewError(done ? "alreadyReviewed" : "notEligible", done ? 409 : 403);
  }
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError("rating", 400);
  const criteria: Record<string, number> = {};
  for (const [k, v] of Object.entries((input.criteria && typeof input.criteria === "object" ? input.criteria : {}) as Record<string, unknown>)) {
    if (v === null || v === undefined || v === 0) continue;
    const n = Number(v);
    if (!CRITERIA[item.targetType].includes(k) || !Number.isInteger(n) || n < 1 || n > 5) throw new ReviewError("criteria", 400);
    criteria[k] = n;
  }
  const comment = typeof input.comment === "string" ? input.comment.trim().replace(/\s+\n/g, "\n") : "";
  if (comment.length > MAX_COMMENT) throw new ReviewError("commentTooLong", 400);
  const photos = parsePhotos(input.photos);

  const id = reviewId(user.id, item.key);
  const m = await moderateComment(comment, photos.length);
  const at = now.toISOString();
  const author = authorOf(user);
  const saved = [];
  for (const p of photos) saved.push({ id: randomUUID(), contentType: p.contentType, ref: await saveFile(`reviews/${id}`, p.data, p.contentType) });
  const doc: StoredReview = {
    id, userId: user.id, key: item.key, targetType: item.targetType, targetId: item.targetId, targetNameAr: item.nameAr, targetNameEn: item.nameEn,
    sourceRef: item.sourceEn, authorName: author.name, authorCountry: author.country, rating, criteria, comment, lang: m.lang, translation: m.translation,
    photos: saved, reply: null, createdAt: at, status: m.status, moderation: { by: m.by, reason: m.reason, note: null, at },
    publishedAt: m.status === "published" ? at : null, ...(item.demo ? { demo: true } : {}),
  };
  if (!(await store().insert(COL, id, doc))) throw new ReviewError("alreadyReviewed", 409);
  return { review: { ...toPublic(doc), status: doc.status, moderationReason: doc.moderation.reason }, complaint: rating <= COMPLAINT_MAX_RATING };
}

/* ----------------------------------------------------------------- reading */

/** Ratings of the Saudi Trip services (public «Service ratings» page). */
export async function serviceRatings() {
  const real = await publishedOf("service");
  const rows = await Promise.all(
    SERVICES.map(async (s) => {
      const list = withDemo("service", s, real.filter((r) => r.targetId === s).map(toPublic));
      return { id: s, nameAr: SERVICE_NAMES[s][0], nameEn: SERVICE_NAMES[s][1], summary: summarize(list), recent: list.filter((r) => r.comment).slice(0, 3) };
    }),
  );
  const count = rows.reduce((a, r) => a + r.summary.count, 0);
  const weighted = rows.reduce((a, r) => a + r.summary.avg * r.summary.count, 0);
  return { overall: { avg: count ? Math.round((weighted / count) * 10) / 10 : 0, count }, services: rows };
}

export async function myReviews(userId: string) {
  const rows = await store().findBy<StoredReview>(COL, "userId", userId);
  return rows
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({ ...toPublic(r), status: r.status, moderationReason: r.moderation.reason, sourceRef: r.sourceRef }));
}

/** A review photo: public once the review is published; otherwise for its author and the back office. */
export async function reviewPhoto(reviewId: string, photoId: string, viewer: PublicUser | null): Promise<{ data: Buffer; contentType: string } | null> {
  const r = await store().get<StoredReview>(COL, reviewId);
  const p = r?.photos.find((x) => x.id === photoId);
  if (!r || !p) return null;
  if (r.status !== "published" && viewer?.id !== r.userId && !viewer?.isAdmin) return null;
  const data = await readFile(p.ref);
  return data ? { data, contentType: p.contentType } : null;
}

/* -------------------------------------------------------------- back office */

export async function adminReviews(status: ReviewStatus | "all" = "pending", limit = 200) {
  const rows = await store().list<StoredReview>(COL, 5000);
  return rows
    .filter((r) => status === "all" || r.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({ ...toPublic(r), status: r.status, moderation: r.moderation, sourceRef: r.sourceRef }));
}

/** Counts, averages by kind, and establishments with low ratings to follow up. */
export async function adminReviewStats() {
  const rows = await store().list<StoredReview>(COL, 5000);
  const byStatus = { published: 0, pending: 0, rejected: 0 };
  for (const r of rows) byStatus[r.status]++;
  const published = rows.filter((r) => r.status === "published");
  const byType = Object.fromEntries(REVIEW_TARGETS.map((t) => [t, summarize(published.filter((r) => r.targetType === t))])) as Record<ReviewTarget, ReviewSummary>;
  const groups = new Map<string, StoredReview[]>();
  for (const r of published) {
    if (r.targetType === "service" || r.targetType === "package") continue;
    const k = `${r.targetType}:${r.targetId}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const followUp = [...groups.values()]
    .map((list) => ({ targetType: list[0].targetType, targetId: list[0].targetId, nameAr: list[0].targetNameAr, nameEn: list[0].targetNameEn, summary: summarize(list) }))
    .filter((g) => g.summary.avg < 3)
    .sort((a, b) => a.summary.avg - b.summary.avg);
  return { byStatus, byType, followUp };
}

export async function adminModerate(id: string, action: "approve" | "reject", note: string | null, now = new Date()) {
  const at = now.toISOString();
  return store().update<StoredReview>(COL, id, (r) => ({
    ...r,
    status: action === "approve" ? "published" : "rejected",
    publishedAt: action === "approve" ? r.publishedAt ?? at : null,
    moderation: { by: "admin", reason: action === "reject" ? "admin" : r.moderation.reason, note: note?.slice(0, 300) || null, at },
  }));
}

/** Official reply of the establishment (or of Saudi Trip for its services); empty text removes it. */
export async function adminReply(id: string, text: string, now = new Date()) {
  const clean = text.trim().slice(0, 1000);
  return store().update<StoredReview>(COL, id, (r) => ({
    ...r,
    reply: clean
      ? { text: clean, at: now.toISOString(), byAr: r.targetType === "service" ? "فريق سعودي تريب" : `إدارة ${r.targetNameAr}`, byEn: r.targetType === "service" ? "Saudi Trip team" : `${r.targetNameEn} management` }
      : null,
  }));
}

/* ------------------------------------------------------ review requests */

/**
 * Asks the traveller, once a day at most, to rate the experiences that became ratable since the
 * last request (in the notifications and by email). Returns whether a request was created.
 */
export async function requestReviews(userId: string, now = new Date()): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return false;
  const asked = new Set(
    (await store().findBy<AppNotification & { itemKeys?: string[] }>("notifications", "userId", userId))
      .filter((n) => n.kind === "review")
      .flatMap((n) => n.itemKeys ?? []),
  );
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const fresh = (await pendingReviews(user, now)).filter((i) => !i.demo && !asked.has(i.key) && i.eligibleAt >= since);
  if (!fresh.length) return false;
  const day = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const id = `review:${userId}:${day}`;
  if (await store().get("notifications", id)) return false;
  const shown = fresh.slice(0, 8);
  const more = fresh.length - shown.length;
  const doc: AppNotification & { itemKeys: string[] } = {
    id, userId, kind: "review", bookingId: "", reference: "", createdAt: now.toISOString(),
    titleAr: "قيّم تجربتك مع سعودي تريب", titleEn: "Rate your experience with Saudi Trip",
    linesAr: [
      "رأيك يساعد المسافرين ويرفع جودة الخدمات السياحية في المملكة. يمكنك تقييم:",
      ...shown.map((i) => `⭐ ${i.nameAr} (${i.sourceAr})`),
      ...(more > 0 ? [`و${more} أخرى.`] : []),
    ],
    linesEn: [
      "Your opinion helps other travellers and raises the quality of tourism services in Saudi Arabia. You can rate:",
      ...shown.map((i) => `⭐ ${i.nameEn} (${i.sourceEn})`),
      ...(more > 0 ? [`and ${more} more.`] : []),
    ],
    href: "/account/reviews", readAt: null, deletedAt: null, email: null, itemKeys: fresh.map((i) => i.key),
  };
  if (!(await store().insert("notifications", id, doc))) return false;
  const sent = await notifyTravellers([user.email], {
    subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`,
    text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n"),
  });
  if (sent) await store().update<AppNotification>("notifications", id, (n) => ({ ...n, email: { to: sent.to, status: sent.status } }));
  return true;
}
