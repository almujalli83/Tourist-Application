import type { FlightOffer, HotelOffer, RoomOccupancy } from "../types";
import type { DocType, EntryType } from "./entry";

export interface Payment { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string }

/** A hotel booked without a package (MT-licensed, 3 to 5 stars). */
export interface StayOrder {
  id: string;
  reference: string;
  /** The agent's (hotel's) confirmation number. */
  confirmation: string;
  entry: EntryType;
  hotel: Omit<HotelOffer, "sig" | "expiresAt">;
  rooms: RoomOccupancy[];
  lead: { name: string; email: string; phone: string };
  requests: string;
  /** Paid online now, or at the hotel on arrival. */
  pay: "online" | "hotel";
  totalSAR: number;
  /** Free cancellation (and date changes) until then; null: non-refundable. */
  freeCancelUntil: string | null;
  status: "confirmed" | "cancelled";
  payment: Payment | null;
  cancellation: { at: string; refundSAR: number; feeSAR: number } | null;
  changes: { at: string; from: { checkIn: string; checkOut: string; totalSAR: number }; to: { checkIn: string; checkOut: string; totalSAR: number }; chargedSAR: number; refundedSAR: number }[];
  loyalty?: { earnedPoints: number };
  /** One hotel of a multi-city trip booked together (each hotel stays its own booking). */
  trip?: StayTrip;
  createdAt: string;
  sandbox?: boolean;
}

export interface StayTrip { id: string; reference: string; index: number; count: number }

export interface FlightPassenger {
  nameEn: string;
  type: "adult" | "child" | "infant";
  nationality: string;
  docType: DocType;
  docMasked: string;
  birthDate: string;
}

export interface FlightSegment {
  offer: Omit<FlightOffer, "sig" | "expiresAt">;
  pnr: string;
  /** One e-ticket per passenger, in the passengers' order. */
  tickets: string[];
  priceSAR: number;
}

export type TripType = "oneway" | "return" | "stopover";

/** Flights booked without a package: domestic, or to / from the Kingdom. */
export interface FlightOrder {
  id: string;
  reference: string;
  entry: EntryType;
  tripType: TripType;
  scope: "domestic" | "international";
  segments: FlightSegment[];
  passengers: FlightPassenger[];
  contact: { email: string; phone: string };
  totalSAR: number;
  status: "confirmed" | "cancelled";
  payment: Payment;
  cancellation: { at: string; refundSAR: number } | null;
  loyalty?: { earnedPoints: number };
  createdAt: string;
  sandbox?: boolean;
}
