/**
 * Saved trip plans of signed-in travellers. A plan is a draft until the package built from it is
 * booked; it is then attached to the booking and can no longer be changed. Visitors keep their
 * plan in the browser and can save it to their account after signing in.
 */
import { randomUUID } from "node:crypto";
import type { PublicUser } from "../auth/types";
import type { StoredBooking } from "../bookings/types";
import { VISA_INSURANCE_FEE_SAR } from "../config";
import { addDays } from "../dates";
import { store } from "../store";
import { estimateBudget } from "./budget";
import { flightTimesFrom } from "./schedule";
import { loadPools, plannerCities } from "./catalog";
import { buildSkeleton, fillDays, normalizeStays, PlanError, sanitizeRequest, type Generated } from "./generate";
import { PLANNER_LIMITS, type TripPlan } from "./types";

const COL = "tripPlans" as const;

export async function listPlans(userId: string): Promise<TripPlan[]> {
  const rows = await store().findBy<TripPlan>(COL, "userId", userId);
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPlan(userId: string, id: string): Promise<TripPlan | null> {
  const p = await store().get<TripPlan>(COL, id);
  return p && p.userId === userId ? p : null;
}

/** Keeps the newest plans: the oldest unbooked drafts beyond the limit are removed. */
async function prune(userId: string) {
  const drafts = (await listPlans(userId)).filter((p) => p.status === "draft");
  for (const p of drafts.slice(PLANNER_LIMITS.maxPlansPerUser)) await store().delete(COL, p.id);
}

export async function savePlan(user: PublicUser, plan: Generated["plan"]): Promise<TripPlan> {
  const now = new Date().toISOString();
  const saved: TripPlan = { ...plan, id: randomUUID(), userId: user.id, createdAt: now, updatedAt: now, status: "draft", bookingId: null, bookingReference: null };
  await store().insert(COL, saved.id, saved);
  await prune(user.id);
  return saved;
}

/** Saves a plan made before signing in (checked and rebuilt from the app's data, like a new one). */
export async function importPlan(user: PublicUser, input: unknown, today: string): Promise<TripPlan> {
  const b = (input && typeof input === "object" ? input : {}) as Partial<TripPlan>;
  const req = sanitizeRequest(b.request, today);
  const allowed = req.cities.length ? req.cities : await plannerCities();
  const stays = normalizeStays(b.stays, { ...req, nights: req.nights ?? (Array.isArray(b.stays) ? b.stays.reduce((a, s) => a + Number(s?.nights || 0), 0) : null) }, allowed);
  if (!stays.length) throw new PlanError("invalidPlan");
  const nights = stays.reduce((a, s) => a + s.nights, 0);
  const locale = b.locale === "en" ? "en" : "ar";
  const pools = await loadPools(stays.map((s) => s.city), req.departureDate, addDays(req.departureDate, nights));
  const days = fillDays(buildSkeleton(req.departureDate, stays), b.days, pools, req, locale);
  return savePlan(user, {
    locale, request: req, stays, returnDate: addDays(req.departureDate, nights),
    summary: typeof b.summary === "string" ? b.summary.slice(0, 600) : "",
    tips: Array.isArray(b.tips) ? b.tips.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 240)).slice(0, 6) : [],
    days, budget: estimateBudget(req, stays, days, VISA_INSURANCE_FEE_SAR), source: b.source === "claude" ? "claude" : "rules", status: "draft",
  });
}

/** Rebuilds a plan's days from the traveller's edits (order, removed / swapped activities, a regenerated day). */
export function applyDays(plan: TripPlan, days: unknown, pools: Awaited<ReturnType<typeof loadPools>>): Pick<TripPlan, "days" | "budget"> {
  const skeleton = plan.days.map(({ date, city, type, fromCity }) => ({ date, city, type, fromCity }));
  const next = fillDays(skeleton, days, pools, plan.request, plan.locale);
  return { days: next, budget: estimateBudget(plan.request, plan.stays, next, plan.budget.visaSAR / Math.max(1, plan.request.rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0))) };
}

export async function updatePlanDays(user: PublicUser, id: string, days: unknown): Promise<TripPlan> {
  const current = await getPlan(user.id, id);
  if (!current) throw new PlanError("notFound");
  if (current.status !== "draft") throw new PlanError("locked");
  const pools = await loadPools(current.stays.map((s) => s.city), current.request.departureDate, current.returnDate);
  const patch = applyDays(current, days, pools);
  let locked = false;
  const saved = await store().update<TripPlan>(COL, id, (p) => {
    if (p.status !== "draft") {
      locked = true;
      return p;
    }
    return { ...p, ...patch, updatedAt: new Date().toISOString() };
  });
  if (locked || !saved) throw new PlanError(locked ? "locked" : "notFound");
  return saved;
}

export async function deletePlan(userId: string, id: string): Promise<void> {
  const p = await getPlan(userId, id);
  if (!p) throw new PlanError("notFound");
  if (p.status !== "draft") throw new PlanError("locked");
  await store().delete(COL, id);
}

/** Does the booking follow the plan (same arrival date, cities and nights)? */
export function bookingMatchesPlan(plan: Pick<TripPlan, "request" | "stays">, criteria: StoredBooking["criteria"]): boolean {
  return plan.request.departureDate === criteria.departureDate
    && plan.stays.length === criteria.stays.length
    && plan.stays.every((s, i) => s.city === criteria.stays[i].city && s.nights === criteria.stays[i].nights);
}

/** Attaches the plan to the booking made from it (when it still matches); returns whether it was attached. */
export async function linkPlanToBooking(userId: string, planId: unknown, booking: Pick<StoredBooking, "id" | "reference" | "criteria"> & { flights?: StoredBooking["flights"] }): Promise<boolean> {
  if (typeof planId !== "string" || !planId) return false;
  const plan = await getPlan(userId, planId);
  if (!plan || plan.status !== "draft" || !bookingMatchesPlan(plan, booking.criteria)) return false;
  let ok = false;
  await store().update<TripPlan>(COL, planId, (p) => {
    if (p.status !== "draft") return p;
    ok = true;
    return { ...p, status: "booked", bookingId: booking.id, bookingReference: booking.reference, flightTimes: booking.flights ? flightTimesFrom(booking.flights) : null, updatedAt: new Date().toISOString() };
  });
  return ok;
}

export async function planForBooking(userId: string, bookingId: string): Promise<TripPlan | null> {
  return (await listPlans(userId)).find((p) => p.bookingId === bookingId) ?? null;
}

/**
 * Moves a draft plan to a new arrival date (same cities and nights), keeping every activity:
 * events are kept when they have a session at the same time on the new day, otherwise removed and
 * reported.
 */
export async function shiftPlanDates(user: PublicUser, id: string, departureDate: unknown, today: string): Promise<{ plan: TripPlan; dropped: { titleAr: string; titleEn: string }[] }> {
  const current = await getPlan(user.id, id);
  if (!current) throw new PlanError("notFound");
  if (current.status !== "draft") throw new PlanError("locked");
  const req = sanitizeRequest({ ...current.request, departureDate }, today);
  const nights = current.stays.reduce((a, s) => a + s.nights, 0);
  const returnDate = addDays(req.departureDate, nights);
  const skeleton = buildSkeleton(req.departureDate, current.stays);
  const raw = current.days.map((d, i) => ({
    date: skeleton[i].date,
    title: d.title,
    items: d.items.map((it) => ({
      id: it.id, note: it.note, meal: it.meal,
      ref: it.kind === "event" ? `${it.ref.split("@")[0]}@${skeleton[i].date}T${it.ref.split("T").pop()}` : it.ref,
    })),
  }));
  const pools = await loadPools(current.stays.map((s) => s.city), req.departureDate, returnDate);
  const days = fillDays(skeleton, raw, pools, req, current.locale);
  const kept = new Set(days.flatMap((d) => d.items.map((x) => x.id)));
  const dropped = current.days.flatMap((d) => d.items).filter((x) => !kept.has(x.id)).map((x) => ({ titleAr: x.titleAr, titleEn: x.titleEn }));
  const saved = await store().update<TripPlan>(COL, id, (p) => ({
    ...p, request: req, returnDate, days,
    budget: estimateBudget(req, p.stays, days, p.budget.visaSAR / Math.max(1, req.rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0))),
    updatedAt: new Date().toISOString(),
  }));
  if (!saved) throw new PlanError("notFound");
  return { plan: saved, dropped };
}
