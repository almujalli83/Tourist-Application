import { PACKAGE_LIMITS } from "../config";
import { priceFlightOffer } from "../pricing";
import type { ActivityOffer, FlightOffer, HotelOffer, TravelAgentRef } from "../types";
import type { ActivitySearchRequest, FlightSearchRequest, HotelSearchRequest, TravelAgentProvider } from "./provider";
import { AGENTS } from "./registry";

const PROVIDER_TIMEOUT_MS = 8000;
const OFFER_TTL_MS = 45 * 60 * 1000;

type AnyOffer = FlightOffer | HotelOffer | ActivityOffer;

/** Offers are cached server-side so bookings are priced from what the agent returned, not from the client. */
const g = globalThis as unknown as { __offerCache?: Map<string, { offer: AnyOffer; expires: number }> };
const cache = (g.__offerCache ??= new Map());

function remember<T extends AnyOffer>(offer: T): T {
  cache.set(offer.id, { offer, expires: Date.now() + OFFER_TTL_MS });
  return offer;
}

export function getCachedOffer<T extends AnyOffer>(id: string): T | undefined {
  const hit = cache.get(id);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(id);
    return undefined;
  }
  return hit.offer as T;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("provider timeout")), PROVIDER_TIMEOUT_MS)),
  ]);
}

function agentRef(a: TravelAgentProvider): TravelAgentRef {
  return { agentId: a.id, agentNameEn: a.nameEn, agentNameAr: a.nameAr };
}

export interface AggregateResult<T> {
  offers: T[];
  failedAgents: string[];
}

async function fanOut<T>(
  run: (a: TravelAgentProvider) => Promise<T[]>,
): Promise<AggregateResult<T>> {
  const settled = await Promise.allSettled(AGENTS.map((a) => withTimeout(run(a))));
  const offers: T[] = [];
  const failedAgents: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") offers.push(...s.value);
    else failedAgents.push(AGENTS[i].id);
  });
  return { offers, failedAgents };
}

export async function searchFlights(req: FlightSearchRequest): Promise<AggregateResult<FlightOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchFlights(req)).map(({ ref, ...o }) =>
      remember<FlightOffer>({ ...o, ...agentRef(a), id: `F:${a.id}:${req.leg.date}:${req.leg.from}${req.leg.to}:${req.cabin}:${ref}`, totalSAR: priceFlightOffer(o.fare, req.pax) }),
    ),
  );
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchHotels(req: HotelSearchRequest): Promise<AggregateResult<HotelOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchHotels(req)).map(({ ref, ...o }) =>
      remember<HotelOffer>({ ...o, ...agentRef(a), id: `H:${a.id}:${req.checkIn}:${req.checkOut}:${ref}:${req.pax.adults}-${req.pax.children}` }),
    ),
  );
  // MT rejects packages with hotels rated below 4 stars (VTP003).
  res.offers = res.offers.filter((h) => h.stars >= PACKAGE_LIMITS.minHotelStars);
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchActivities(req: ActivitySearchRequest): Promise<AggregateResult<ActivityOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchActivities(req)).map(({ ref, ...o }) =>
      remember<ActivityOffer>({ ...o, ...agentRef(a), id: `A:${a.id}:${req.from}:${ref}:${req.pax.adults}-${req.pax.children}` }),
    ),
  );
  res.offers.sort((x, y) => x.date.localeCompare(y.date) || x.totalSAR - y.totalSAR);
  return res;
}
