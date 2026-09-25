/** Experiences & events tickets (Saudi seasons), bought separately from packages. */
export const EVENT_CATEGORIES = ["concert", "theatre", "sports", "family", "culture", "dining", "adventure"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export type EventProviderId = "webook" | "mytable";

/** A priced block of numbered seats (rows A, B, C… × seats 1…n). */
export interface SeatSection {
  id: string;
  nameAr: string;
  nameEn: string;
  priceSAR: number;
  rows: number;
  seatsPerRow: number;
}

/** General admission ticket (no seat). */
export interface TicketType {
  id: string;
  nameAr: string;
  nameEn: string;
  priceSAR: number;
  capacity: number;
}

export interface EventSession {
  id: string;
  /** Start time, ISO UTC. */
  start: string;
}

export interface RefundPolicy {
  refundable: boolean;
  /** Cancellation allowed until this many hours before the session. */
  cutoffHours: number;
}

export interface EventItem {
  id: string;
  provider: EventProviderId;
  seasonId: string | null;
  city: string;
  category: EventCategory;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  venueAr: string;
  venueEn: string;
  lat: number;
  lng: number;
  durationMins: number;
  /** Minimum age, when restricted. */
  minAge?: number;
  seating: "seated" | "general";
  sections?: SeatSection[];
  ticketTypes?: TicketType[];
  sessions: EventSession[];
  refund: RefundPolicy;
  maxPerOrder: number;
}

export interface Season {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  cities: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** Accent colour of the season card (#rrggbb). */
  color: string;
  status: "published" | "hidden";
  updatedAt: string;
}

export interface OrderLine {
  /** Seat section or ticket type id. */
  kind: "seat" | "general";
  typeId: string;
  typeNameAr: string;
  typeNameEn: string;
  seat: string | null;
  priceSAR: number;
}

export interface IssuedTicket {
  id: string;
  /** Code encoded in the QR (from the provider). */
  code: string;
  line: OrderLine;
}

export interface EventOrder {
  id: string;
  reference: string;
  userId: string;
  idempotencyKey: string;
  createdAt: string;
  status: "CONFIRMED" | "CANCELLED";
  provider: EventProviderId;
  providerRef: string;
  /** Snapshot of the event and session at purchase time. */
  event: Pick<EventItem, "id" | "titleAr" | "titleEn" | "venueAr" | "venueEn" | "city" | "category" | "lat" | "lng" | "durationMins" | "seasonId" | "refund">;
  session: EventSession;
  tickets: IssuedTicket[];
  totalSAR: number;
  displayCurrency: string;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string };
  holderName: string;
  holderEmail: string;
  cancellation: { at: string; refundSAR: number; refundId: string } | null;
}
