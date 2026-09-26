/**
 * Browser-side hand-off from an approved plan to the package booking wizard (which lives under
 * /package-visa with its own state): the plan page stores the search, the wizard picks it up once.
 */
import { paxFromRooms } from "../occupancy";
import type { SearchCriteria } from "../types";
import type { TripPlan } from "./types";

const KEY = "ta_plan_handoff";

export function planCriteria(plan: Pick<TripPlan, "request" | "stays" | "returnDate">): SearchCriteria {
  const r = plan.request;
  return { origin: r.origin, stays: plan.stays.map((s) => ({ ...s })), departureDate: r.departureDate, returnDate: plan.returnDate, rooms: r.rooms, pax: paxFromRooms(r.rooms), cabin: r.cabin, nationality: r.nationality };
}

export function writeHandoff(planId: string, criteria: SearchCriteria) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ planId, criteria, at: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

/** Reads and removes the hand-off (valid for 10 minutes). */
export function takeHandoff(): { planId: string; criteria: SearchCriteria } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v.planId !== "string" || !v.criteria || Date.now() - Number(v.at) > 10 * 60_000) return null;
    return { planId: v.planId, criteria: v.criteria as SearchCriteria };
  } catch {
    return null;
  }
}

/** Visitors' plan, kept in the browser until they sign in and save it. */
export const GUEST_PLAN_KEY = "ta_plan_draft";
export function readGuestPlan(): TripPlan | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(GUEST_PLAN_KEY) ?? "null");
    return v && Array.isArray(v.days) && v.request ? (v as TripPlan) : null;
  } catch {
    return null;
  }
}
export function writeGuestPlan(p: TripPlan | null) {
  try {
    if (p) sessionStorage.setItem(GUEST_PLAN_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(GUEST_PLAN_KEY);
  } catch {
    /* storage unavailable */
  }
}
