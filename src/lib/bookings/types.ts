import type { PriceBreakdown } from "../pricing";
import type { ActivityOffer, FlightOffer, HotelOffer, PaxType, SearchCriteria } from "../types";

export type BookingStatus = "PAID" | "SUBMITTED" | "SUBMISSION_FAILED" | "COMPLETED" | "CANCELLED";

export interface StoredApplicant {
  applicationNo: string;
  paxType: PaxType;
  nameEn: string;
  nationality: string;
  passportNo: string;
  email: string;
  sponsorApplicationNo: string | null;
  submission: { ok: boolean; errors: { code: string; message: string }[]; submittedAt: string } | null;
  appStatus: string | null;
  visaNumber: string | null;
  visaIssueDate: string | null;
  visaExpiryDate: string | null;
  visaStatus: string | null;
  insuranceStatus: string | null;
}

export interface StoredBooking {
  id: string;
  reference: string;
  userId: string;
  accountType: "individual" | "company";
  /** B2B: the agency's own reference for its customer. */
  clientReference: string | null;
  createdAt: string;
  criteria: SearchCriteria;
  flights: FlightOffer[];
  hotels: HotelOffer[];
  activities: ActivityOffer[];
  price: PriceBreakdown;
  displayCurrency: string;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string };
  status: BookingStatus;
  mt: {
    mode: "live" | "sandbox";
    messageId: string;
    packageId: string | null;
    packageStatus: string | null;
    lastCheckedAt: string | null;
  };
  applicants: StoredApplicant[];
  /** Ticket number per entry of `flights` (sent to MT as arrival/return ticket numbers). */
  ticketNos?: string[];
  /** Package updates (extensions / reductions) made after purchase, oldest first. */
  modifications?: BookingModification[];
  /** eSIMs bought with the package (separate from the package price). */
  esim?: { orderId: string | null; amountSAR: number; failed?: boolean };
  /** Trip plan (smart planner) the package was built from. */
  tripPlanId?: string | null;
  /** The plan's event tickets and table bookings bought with the package (and those that couldn't be). */
  planExtras?: {
    events: { itemId: string; titleAr: string; titleEn: string; orderId: string | null; error?: string }[];
    tables: { itemId: string; titleAr: string; titleEn: string; bookingId: string | null; error?: string }[];
    issues: { itemId: string; titleAr: string; titleEn: string; reason: string }[];
  };
  /** Incremented by every package change; a change must be priced on the current version. */
  version?: number;
  /** Held while a package change is being applied (prevents concurrent changes). */
  lock?: { token: string; at: string } | null;
}

export interface AgentApproval {
  agentId: string;
  agentNameEn: string;
  agentNameAr: string;
  reference: string;
  status: "APPROVED" | "RELEASED";
}

export type ModificationKind = "extend" | "shorten";
export type TransportMode = "flight" | "car" | "train";

export interface ModificationLine {
  type: "hotelAdded" | "hotelExtended" | "hotelShortened" | "hotelCancelled" | "flightAdded" | "flightChanged" | "flightCancelled" | "activityCancelled" | "transport";
  /** What the line refers to (hotel/flight/activity name, route…), for display. */
  labelEn: string;
  labelAr: string;
  agentId: string | null;
  agentNameEn: string | null;
  agentNameAr: string | null;
  /** Amount charged (positive) or refunded (negative) for this line, in SAR. */
  amountSAR: number;
  /** Amount lost under the cancellation / change policy, in SAR. */
  nonRefundableSAR: number;
  detail?: string;
}

export interface BookingModification {
  id: string;
  /** Client-supplied key: the same request is applied only once. */
  idempotencyKey?: string;
  createdAt: string;
  kind: ModificationKind;
  previousReturnDate: string;
  newReturnDate: string;
  /** Extension target: the last city, or a new city reached by the chosen transport. */
  target: { mode: "lastCity" | "newCity"; city: string; transport: TransportMode | null } | null;
  lines: ModificationLine[];
  chargeSAR: number;
  refundSAR: number;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number } | null;
  refund: { refundId: string; amountSAR: number } | null;
  previousTotalSAR: number;
  newTotalSAR: number;
  /** Approvals of the travel agents, obtained before MT is updated. */
  agents?: AgentApproval[];
  mt: {
    messageId: string;
    status: "UPDATED" | "PARTIAL" | "FAILED";
    results: { applicationNo: string; ok: boolean; errorCodes: string[] }[];
  };
  /** Emails notified once MT accepted the update. */
  notified: { emails: string[]; at: string; delivered?: boolean } | null;
}
