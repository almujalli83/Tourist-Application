/** Intercity buses (SAPTCO…): shared types (client-safe). */
export type BusClass = "standard" | "vip";
export type BusPassengerType = "adult" | "child";

export interface BusTrip {
  id: string;
  providerId: string;
  tripNo: string;
  from: string;
  to: string;
  fromTerminal: string;
  toTerminal: string;
  /** ISO UTC. */
  depart: string;
  arrive: string;
  durationMins: number;
  cls: BusClass;
  fare: { adult: number; child: number };
  seatsLeft: number;
}

export interface BusSeatMap { rows: number; letters: string[]; aisleAfter: number; taken: string[] }

export interface BusTicket { seat: string; passenger: number; code: string; priceSAR: number }

export interface BusPassenger { nameEn: string; nationality: string; passportMasked: string; type: BusPassengerType }

export interface BusOrder {
  id: string;
  reference: string;
  pnr: string;
  providerId: string;
  providerNameAr: string;
  providerNameEn: string;
  trip: BusTrip;
  passengers: BusPassenger[];
  tickets: BusTicket[];
  totalSAR: number;
  status: "CONFIRMED" | "CANCELLED";
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string };
  cancellation: { at: string; refundSAR: number } | null;
  createdAt: string;
  sandbox?: boolean;
}

export const MAX_BUS_PASSENGERS = 9;
