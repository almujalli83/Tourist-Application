import { searchActivities } from "@/lib/agents/aggregator";
import { todayISO } from "@/lib/dates";
import { body, error, handle, json } from "@/lib/http";
import { stayDates, validateCriteria } from "@/lib/itinerary";
import type { SearchCriteria } from "@/lib/types";

export const POST = handle(async (req: Request) => {
  const criteria = await body<SearchCriteria>(req);
  if (!criteria) return error("invalidBody");
  const errors = validateCriteria(criteria, todayISO());
  if (errors.length) return error("invalidCriteria", 400, errors);
  const stays = stayDates(criteria);
  const results = await Promise.all(stays.map((s) => searchActivities({ city: s.city, from: s.checkIn, to: s.checkOut, pax: criteria.pax })));
  return json({ stays: stays.map((stay, i) => ({ stay, offers: results[i].offers })) });
});
