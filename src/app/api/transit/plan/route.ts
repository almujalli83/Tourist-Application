import { body, error, handle, json } from "@/lib/http";
import { planJourneys, TransitError } from "@/lib/transit/transit";
import type { TransitPlace } from "@/lib/transit/types";

/** Journeys by metro and bus from the operator's planner (public). */
export const POST = handle(async (req: Request) => {
  const input = await body<{ city?: string; from?: TransitPlace; to?: TransitPlace; departAt?: string }>(req);
  if (!input) return error("invalidRequest", 400);
  try {
    return json({ journeys: await planJourneys(String(input.city ?? "RUH"), input) });
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
