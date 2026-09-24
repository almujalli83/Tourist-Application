import type { ActivityOffer, CabinClass, FlightLeg, HotelOffer, PaxCount } from "../types";

export interface FlightSearchRequest {
  leg: FlightLeg;
  pax: PaxCount;
  cabin: CabinClass;
}

export interface HotelSearchRequest {
  city: string;
  checkIn: string;
  checkOut: string;
  pax: PaxCount;
}

export interface ActivitySearchRequest {
  city: string;
  from: string;
  to: string;
  pax: PaxCount;
}

/** Offers returned by a provider before the aggregator stamps them with agent info. */
export type RawFlight = Omit<import("../types").FlightOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id" | "totalSAR">;
export type RawHotel = Omit<HotelOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id">;
export type RawActivity = Omit<ActivityOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id">;

/**
 * Contract every travel agent (OTA / DMC / consolidator) integration implements.
 * Real integrations (NDC, GDS, bed-banks, activity APIs) plug in here.
 */
export interface TravelAgentProvider {
  id: string;
  nameEn: string;
  nameAr: string;
  searchFlights(req: FlightSearchRequest): Promise<(RawFlight & { ref: string })[]>;
  searchHotels(req: HotelSearchRequest): Promise<(RawHotel & { ref: string })[]>;
  searchActivities(req: ActivitySearchRequest): Promise<(RawActivity & { ref: string })[]>;
}
