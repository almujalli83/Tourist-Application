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
}
