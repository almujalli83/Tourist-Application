import { searchFlights } from "@/lib/agents/aggregator";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { buildLegs, validateCriteria } from "@/lib/itinerary";
import type { SearchCriteria } from "@/lib/types";

/** Searches every travel agent for every leg of the itinerary. */
export const POST = handle(async (req: Request) => {
  const criteria = await body<SearchCriteria>(req);
  if (!criteria) return error("invalidBody");
  const errors = validateCriteria(criteria, todayISO());
  if (errors.length) return error("invalidCriteria", 400, errors);
  const legs = buildLegs(criteria);
  const results = await Promise.all(legs.map((leg) => searchFlights({ leg, pax: criteria.pax, cabin: criteria.cabin })));
  return json({
    legs: legs.map((leg, i) => ({ leg, offers: results[i].offers, failedAgents: results[i].failedAgents })),
  });
});
