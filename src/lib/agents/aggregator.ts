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
  agentIds?: string[],
): Promise<AggregateResult<T>> {
  const agents = agentIds ? AGENTS.filter((a) => agentIds.includes(a.id)) : AGENTS;
  const settled = await Promise.allSettled(agents.map((a) => withTimeout(run(a))));
  const unsigned: T[] = [];
  const failedAgents: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") unsigned.push(...s.value);
    else {
      failedAgents.push(agents[i].id);
      console.error(`travel agent ${agents[i].id} failed:`, s.reason);
    }
  });
  return { offers: unsigned.map(sign), failedAgents };
}

/** Searches flights with every agent, or only with `agentIds` (e.g. the agent that issued a ticket). */
export async function searchFlights(req: FlightSearchRequest, agentIds?: string[]): Promise<AggregateResult<FlightOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchFlights(req)).map(({ ref, ...o }) =>
      ({ ...o, ...agentRef(a), id: `F:${a.id}:${req.leg.date}:${req.leg.from}${req.leg.to}:${req.cabin}:${ref}`, totalSAR: priceFlightOffer(o.fare, req.pax) }) as FlightOffer,
    ),
    agentIds,
  );
  res.offers.sort((x, y) => x.totalSAR - y.totalSAR);
  return res;
}

export async function searchHotels(req: HotelSearchRequest, agentIds?: string[]): Promise<AggregateResult<HotelOffer>> {
  const res = await fanOut(async (a) =>
    (await a.searchHotels(req)).map(({ ref, ...o }) =>
      ({ ...o, ...agentRef(a), id: `H:${a.id}:${req.checkIn}:${req.checkOut}:${ref}:${hotelPaxKey(req.pax, req.rooms)}`, forPax: hotelPaxKey(req.pax, req.rooms) }) as HotelOffer,
    ),
    agentIds,
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

/**
 * Quotes extra nights in a hotel already booked, with the agent that booked it. Returns a signed
 * offer covering only the extra nights (from the current check-out to `newCheckOut`).
 */
export async function quoteHotelExtension(hotel: HotelOffer, newCheckOut: string): Promise<HotelOffer | null> {
  const agent = AGENTS.find((a) => a.id === hotel.agentId);
  if (!agent) return null;
  const quote = await withTimeout(agent.quoteStayExtension({ hotel, newCheckOut })).catch(() => null);
  if (!quote) return null;
  const nights = Math.round((Date.parse(newCheckOut) - Date.parse(hotel.checkOut)) / 86_400_000);
  if (nights < 1) return null;
  return sign({
    ...hotel,
    id: `HX:${hotel.id}:${newCheckOut}`,
    checkIn: hotel.checkOut,
    checkOut: newCheckOut,
    nights,
    pricePerNightSAR: quote.pricePerNightSAR,
    totalSAR: Math.round(quote.pricePerNightSAR * nights * 100) / 100,
  });
}

/** Change fee (all tickets) for moving a ticket to another date or route, per the issuing agent. */
export function flightChangeFee(offer: FlightOffer, pax: PaxCount): number {
  const agent = AGENTS.find((a) => a.id === offer.agentId);
  return (agent?.flightChangeFeeSAR(offer) ?? 0) * (pax.adults + pax.children);
}

export interface AgentChangeLine {
  agentId: string | null;
  type: string;
  labelEn: string;
  amountSAR: number;
  nonRefundableSAR: number;
}

export class AgentRejectedError extends Error {
  constructor(public agents: { agentId: string; reason: string }[]) {
    super("agentRejected");
  }
}

/**
 * Asks every agent involved in a change for approval (in parallel). If any agent rejects or
 * fails, the approvals already given are released and AgentRejectedError is thrown.
 */
export async function requestAgentChanges(bookingReference: string, lines: AgentChangeLine[]) {
  const byAgent = new Map<string, AgentChangeLine[]>();
  for (const l of lines) if (l.agentId) byAgent.set(l.agentId, [...(byAgent.get(l.agentId) ?? []), l]);
  const results = await Promise.all(
    [...byAgent].map(async ([agentId, items]) => {
      const agent = AGENTS.find((a) => a.id === agentId);
      if (!agent) return { agentId, ok: false as const, reason: "unknownAgent" };
      try {
        const res = await withTimeout(
          agent.requestChange({ bookingReference, items: items.map((i) => ({ type: i.type, description: i.labelEn, amountSAR: i.amountSAR })) }),
        );
        return res.approved ? { agentId, ok: true as const, agent, reference: res.reference } : { agentId, ok: false as const, reason: res.reason };
      } catch (err) {
        return { agentId, ok: false as const, reason: (err as Error).message };
      }
    }),
  );
  const approved = results.filter((r) => r.ok);
  const rejected = results.filter((r) => !r.ok);
  if (rejected.length) {
    await releaseAgentChanges(approved.map((a) => ({ agentId: a.agentId, reference: a.reference })));
    throw new AgentRejectedError(rejected.map((r) => ({ agentId: r.agentId, reason: r.reason })));
  }
  return approved.map((a) => ({ ...agentRef(a.agent), reference: a.reference }));
}

export async function releaseAgentChanges(approvals: { agentId: string; reference: string }[]) {
  await Promise.allSettled(approvals.map((a) => AGENTS.find((x) => x.id === a.agentId)?.releaseChange(a.reference)));
}

export async function confirmAgentChanges(approvals: { agentId: string; reference: string }[]) {
  await Promise.allSettled(approvals.map((a) => AGENTS.find((x) => x.id === a.agentId)?.confirmChange(a.reference)));
}
