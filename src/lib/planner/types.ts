/** Smart trip planner: suggests destinations, length, budget and a day-by-day plan before booking. */
import type { CabinClass, RoomOccupancy } from "../types";

export const INTERESTS = ["heritage", "culture", "nature", "beach", "adventure", "shopping", "food", "entertainment", "religious"] as const;
export type Interest = (typeof INTERESTS)[number];
export const PACES = ["relaxed", "moderate", "intense"] as const;
export type Pace = (typeof PACES)[number];
export const BUDGET_TIERS = ["economy", "comfort", "luxury"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

/** Planner limits (a plan is a draft of a package, so the package rules apply as well). */
export const PLANNER_LIMITS = { minNights: 2, maxNights: 21, maxCities: 4, maxNotesChars: 300, maxPlansPerUser: 20 } as const;

export interface PlanRequest {
  origin: string;
  nationality: string;
  departureDate: string;
  /** null = let the planner suggest the length. */
  nights: number | null;
  /** Empty = let the planner suggest the destinations. */
  cities: string[];
  rooms: RoomOccupancy[];
  cabin: CabinClass;
  interests: Interest[];
  pace: Pace;
  budgetTier: BudgetTier;
  /** Optional ceiling for the whole trip, SAR. */
  maxBudgetSAR: number | null;
  /** Leave time for the five prayers. */
  prayer: boolean;
  /** Someone with reduced mobility: prefer accessible places. */
  accessible: boolean;
  notes: string;
}

export type PlanItemKind = "place" | "event" | "restaurant";

/**
 * One activity of a day. `ref` points to app data ("place:<id>", "restaurant:<id>",
 * "event:<eventId>@<YYYY-MM-DDTHH:MM>"); the other fields are resolved from it on the server.
 */
export interface PlanItem {
  id: string;
  ref: string;
  kind: PlanItemKind;
  titleAr: string;
  titleEn: string;
  /** Short suggestion written by the planner (in the plan's language). */
  note: string;
  lat: number;
  lng: number;
  durationMins: number;
  category: string;
  /** Meal slot for restaurants. */
  meal?: "lunch" | "dinner";
  /** Fixed start "HH:MM" (events). */
  fixedStart?: string;
  /** Estimated cost for the whole party, SAR (tickets). */
  costSAR?: number;
  hours?: { days: number[]; open: string; close: string }[];
  open24h?: boolean;
  /** In-app booking link suggested for the item (event tickets, table booking). */
  bookHref?: string;
}

export type DayType = "arrival" | "full" | "transfer" | "departure";

export interface PlanDay {
  date: string;
  city: string;
  type: DayType;
  /** City left on a transfer day. */
  fromCity?: string;
  title: string;
  items: PlanItem[];
}

export interface PlanBudget {
  flightsSAR: number;
  hotelsSAR: number;
  activitiesSAR: number;
  foodSAR: number;
  visaSAR: number;
  totalSAR: number;
  /** Package minimum (2,000 SAR per adult) — flights, hotels, activities and visa must reach it. */
  packageMinSAR: number;
  overBudget: boolean;
}

export interface TripPlan {
  id: string;
  userId: string | null;
  locale: "ar" | "en";
  createdAt: string;
  updatedAt: string;
  request: PlanRequest;
  stays: { city: string; nights: number }[];
  returnDate: string;
  summary: string;
  tips: string[];
  days: PlanDay[];
  budget: PlanBudget;
  source: "claude" | "rules";
  status: "draft" | "booked";
  bookingId?: string | null;
  bookingReference?: string | null;
}

/** Most activities a day can hold (meals and events included). */
export const maxItems = (type: DayType, pace: Pace) =>
  type === "full" ? { relaxed: 4, moderate: 6, intense: 8 }[pace] : type === "departure" ? 2 : 4;

/** Items the traveller can reorder (events and meals keep their time). */
export const isFlexible = (i: Pick<PlanItem, "fixedStart" | "meal">) => !i.fixedStart && !i.meal;
