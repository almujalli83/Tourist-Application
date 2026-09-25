import { PACKAGE_LIMITS } from "../config";
import { signOffer } from "./offer-signing";
import { priceFlightOffer } from "../pricing";
import { occupancyKey } from "../occupancy";
import type { ActivityOffer, FlightOffer, HotelOffer, PaxCount, RoomOccupancy, TravelAgentRef } from "../types";
import type { ActivitySearchRequest, FlightSearchRequest, HotelSearchRequest, TravelAgentProvider } from "./provider";
import { AGENTS } from "./registry";

const PROVIDER_TIMEOUT_MS = 8000;

/** Stamps the offer with an expiry and server signature (verified at booking time). */
const sign = <T extends object>(offer: T): T => signOffer(offer);

export const paxKey = (p: { adults: number; children: number; infants: number }) => `${p.adults}-${p.children}-${p.infants}`;
/** Hotel quotes are bound to the exact rooms and guests they were priced for. */
export const hotelPaxKey = (p: PaxCount, rooms: RoomOccupancy[]) => `${paxKey(p)}|${occupancyKey(rooms)}`;

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

/**
 * Queries every agent in parallel. Only provider errors mark an agent as failed; the offers
 * are signed afterwards so a server misconfiguration surfaces as an error, not as "no results".
 */
async function fanOut<T extends object>(
  run: (a: TravelAgentProvider) => Promise<T[]>,
): Promise<AggregateResult<T>> {
  const settled = await Promise.allSettled(AGENTS.map((a) => withTimeout(run(a))));
  const unsigned: T[] = [];
  const failedAgents: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") unsigned.push(...s.value);
    else {
      failedAgents.push(AGENTS[i].id);
      console.error(`travel agent ${AGENTS[i].id} failed:`, s.reason);
    }
  });
  return { offers: unsigned.map(sign), failedAgents };
}

export async function searchFlights(req: FlightSearchRequest): Promise<AggregateResult<FlightOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchFlights(req)).map(({ ref, ...o }) =>
      ({ ...o, ...agentRef(a), id: `F:${a.id}:${req.leg.date}:${req.leg.from}${req.leg.to}:${req.cabin}:${ref}`, totalSAR: priceFlightOffer(o.fare, req.pax) }) as FlightOffer,
    ),
  );
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchHotels(req: HotelSearchRequest): Promise<AggregateResult<HotelOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchHotels(req)).map(({ ref, ...o }) =>
      ({ ...o, ...agentRef(a), id: `H:${a.id}:${req.checkIn}:${req.checkOut}:${ref}:${hotelPaxKey(req.pax, req.rooms)}`, forPax: hotelPaxKey(req.pax, req.rooms) }) as HotelOffer,
    ),
  );
  // Packages require MT-licensed hotels of the minimum star rating (Key Package Requirements).
  res.offers = res.offers.filter((h) => h.stars >= PACKAGE_LIMITS.minHotelStars && !!h.licenseNo);
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchActivities(req: ActivitySearchRequest): Promise<AggregateResult<ActivityOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchActivities(req)).map(({ ref, ...o }) =>
      ({ ...o, ...agentRef(a), id: `A:${a.id}:${req.from}:${ref}:${paxKey(req.pax)}`, forPax: paxKey(req.pax) }) as ActivityOffer,
    ),
  );
  res.offers.sort((x, y) => x.date.localeCompare(y.date) || x.totalSAR - y.totalSAR);
  return res;
}
