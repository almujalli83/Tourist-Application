import { PACKAGE_LIMITS } from "../config";
import { signOffer } from "./offer-signing";
import { priceFlightOffer } from "../pricing";
import type { ActivityOffer, FlightOffer, HotelOffer, TravelAgentRef } from "../types";
import type { ActivitySearchRequest, FlightSearchRequest, HotelSearchRequest, TravelAgentProvider } from "./provider";
import { AGENTS } from "./registry";

const PROVIDER_TIMEOUT_MS = 8000;

/** Stamps the offer with an expiry and server signature (verified at booking time). */
const sign = <T extends object>(offer: T): T => signOffer(offer);

export const paxKey = (p: { adults: number; children: number; infants: number }) => `${p.adults}-${p.children}-${p.infants}`;

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
      sign<FlightOffer>({ ...o, ...agentRef(a), id: `F:${a.id}:${req.leg.date}:${req.leg.from}${req.leg.to}:${req.cabin}:${ref}`, totalSAR: priceFlightOffer(o.fare, req.pax) }),
    ),
  );
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchHotels(req: HotelSearchRequest): Promise<AggregateResult<HotelOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchHotels(req)).map(({ ref, ...o }) =>
      sign<HotelOffer>({ ...o, ...agentRef(a), id: `H:${a.id}:${req.checkIn}:${req.checkOut}:${ref}:${paxKey(req.pax)}`, forPax: paxKey(req.pax) }),
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
      sign<ActivityOffer>({ ...o, ...agentRef(a), id: `A:${a.id}:${req.from}:${ref}:${paxKey(req.pax)}`, forPax: paxKey(req.pax) }),
    ),
  );
  res.offers.sort((x, y) => x.date.localeCompare(y.date) || x.totalSAR - y.totalSAR);
  return res;
}
