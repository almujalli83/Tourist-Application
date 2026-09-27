/** Public transport (metro & buses): shared types (client-safe). */
export type TransitMode = "walk" | "metro" | "bus";

export interface TransitStop { id: string; nameAr: string; nameEn: string; lat: number; lng: number }
export interface TransitLine { id: string; nameAr: string; nameEn: string; color: string; stops: TransitStop[] }

export interface TransitPlace { name: string; nameAr?: string; lat: number; lng: number }

export interface JourneyLeg {
  mode: TransitMode;
  /** Line number / name (metro line 1–6, bus route "150"…). */
  line: string | null;
  lineNameAr: string | null;
  lineNameEn: string | null;
  color: string | null;
  from: TransitPlace;
  to: TransitPlace;
  /** Saudi local "YYYY-MM-DDTHH:MM". */
  departAt: string;
  arriveAt: string;
  mins: number;
  stops: number;
  headsign: string | null;
  headsignAr?: string | null;
}

export interface Journey {
  id: string;
  legs: JourneyLeg[];
  departAt: string;
  arriveAt: string;
  mins: number;
  changes: number;
  walkMins: number;
  /** The ticket that covers the journey. */
  productId: string | null;
}

export interface Arrival {
  mode: "metro" | "bus";
  line: string;
  lineNameAr: string;
  lineNameEn: string;
  color: string;
  headsign: string;
  headsignAr?: string;
  stopName: string;
  stopNameAr: string;
  inMins: number;
  /** Live position from the operator (else timetable). */
  realtime: boolean;
}

export type TicketClass = "standard" | "first";

export interface TransitProduct {
  id: string;
  nameAr: string;
  nameEn: string;
  cls: TicketClass;
  /** How long the ticket is valid once activated (minutes). */
  validityMins: number;
  priceSAR: number;
  modes: ("metro" | "bus")[];
}

export type TicketStatus = "unused" | "active" | "expired" | "refunded";

export interface TransitTicket {
  id: string;
  reference: string;
  city: string;
  productId: string;
  nameAr: string;
  nameEn: string;
  cls: TicketClass;
  validityMins: number;
  priceSAR: number;
  status: TicketStatus;
  /** Operator's ticket code (shown as the QR at the gates). */
  code: string;
  activatedAt: string | null;
  validUntil: string | null;
  orderId: string;
  createdAt: string;
  sandbox?: boolean;
}

export interface TopUp { id: string; reference: string; cardNo: string; amountSAR: number; balanceSAR: number | null; createdAt: string; sandbox?: boolean }

/** Top-up amounts offered for the transit card (SAR). */
export const TOPUP_AMOUNTS = [10, 20, 50, 100] as const;
