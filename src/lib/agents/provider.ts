import type { ActivityOffer, CabinClass, FlightLeg, FlightOffer, HotelOffer, PaxCount, RoomOccupancy } from "../types";

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
  /** Rooms to book and their guests (adults 18+, children's ages). */
  rooms: RoomOccupancy[];
  /** Standalone booking (no package): pay-at-hotel rates may be offered besides prepaid ones. */
  standalone?: boolean;
}

export interface ActivitySearchRequest {
  city: string;
  from: string;
  to: string;
  pax: PaxCount;
}

export interface HotelBookRequest {
  offer: HotelOffer;
  /** Our booking reference, sent to the agent. */
  reference: string;
  lead: { name: string; email: string; phone: string };
  rooms: RoomOccupancy[];
  requests: string;
}

export interface FlightIssueRequest {
  offer: FlightOffer;
  reference: string;
  passengers: { nameEn: string; type: "adult" | "child" | "infant"; nationality: string; docType: string; docNo: string; birthDate: string }[];
  contact: { email: string; phone: string };
}

/** A booking the agent refused (no availability, fare gone…) or couldn't process. */
export class AgentBookingError extends Error {
  constructor(public code: "rejected" | "unavailable") {
    super(code);
  }
}

/** Offers returned by a provider before the aggregator stamps them with agent info. */
export type RawFlight = Omit<import("../types").FlightOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id" | "totalSAR">;
export type RawHotel = Omit<HotelOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id" | "forPax">;
export type RawActivity = Omit<ActivityOffer, "agentId" | "agentNameEn" | "agentNameAr" | "id" | "forPax">;

/**
 * Contract every travel agent (OTA / DMC / consolidator) integration implements.
 * Real integrations (NDC, GDS, bed-banks, activity APIs) plug in here.
 */
export interface TravelAgentProvider {
  id: string;
  nameEn: string;
  nameAr: string;
  /** Generated test inventory (bookings and tickets are not real). */
  sandbox?: boolean;
  searchFlights(req: FlightSearchRequest): Promise<(RawFlight & { ref: string })[]>;
  searchHotels(req: HotelSearchRequest): Promise<(RawHotel & { ref: string })[]>;
  searchActivities(req: ActivitySearchRequest): Promise<(RawActivity & { ref: string })[]>;
  /** Price per night for staying longer in a hotel already booked with this agent. */
  quoteStayExtension(req: { hotel: HotelOffer; newCheckOut: string }): Promise<{ pricePerNightSAR: number } | null>;
  /** Fee charged per ticket (adults and children) to change the date or route of a ticket it issued. */
  flightChangeFeeSAR(offer: FlightOffer): number;
  /**
   * Sends a package change (ticket reissue, stay extension, cancellations, new bookings) to the
   * agent for approval. Nothing is final until `confirmChange`; `releaseChange` withdraws it.
   */
  requestChange(req: AgentChangeRequest): Promise<{ approved: true; reference: string } | { approved: false; reason: string }>;
  confirmChange(reference: string): Promise<void>;
  releaseChange(reference: string): Promise<void>;
  /** The same hotel, room and rate on other dates (standalone date changes); null when unavailable. */
  quoteHotelDates(req: { hotel: HotelOffer; checkIn: string; checkOut: string }): Promise<{ pricePerNightSAR: number; freeCancelUntil: string | null } | null>;
  /** Standalone hotel booking: the agent's confirmation number. */
  bookHotel(req: HotelBookRequest): Promise<{ confirmation: string }>;
  cancelHotel(confirmation: string): Promise<void>;
  /** Standalone flight: issues the e-tickets (one per passenger) under one PNR. */
  issueFlight(req: FlightIssueRequest): Promise<{ pnr: string; tickets: string[] }>;
  cancelFlight(pnr: string): Promise<void>;
}

export interface AgentChangeRequest {
  bookingReference: string;
  /** Items of the change handled by this agent (hotels, flights, activities). */
  items: { type: string; description: string; amountSAR: number }[];
}
