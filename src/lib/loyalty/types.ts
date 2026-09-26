import type { EarnService } from "./rules";

/**
 * Ledger entry. Credits (earn, bonus, return, positive adjust) are "lots" that keep their own
 * remaining points, availability and expiry; debits (redeem, reverse, expire, negative adjust)
 * record the lots they took points from.
 */
export type EntryType = "earn" | "bonus" | "redeem" | "return" | "reverse" | "expire" | "adjust";
export type SourceKind = EarnService | "modification" | "review" | "referral" | "welcome" | "admin";

export interface LoyaltySource {
  kind: SourceKind;
  id: string;
  /** Booking / order reference shown to the traveller. */
  reference?: string;
}

export interface LoyaltyEntry {
  id: string;
  at: string;
  type: EntryType;
  /** Signed: credits are positive, debits negative. */
  points: number;
  source?: LoyaltySource;
  /** Credits: points not used yet, when they can be used, and when they expire. */
  remaining?: number;
  availableAt?: string;
  expiresAt?: string;
  /** Card spend counted for the tier (earn: positive, reverse: negative). */
  spendSAR?: number;
  /** Earn: the multipliers applied. */
  multiplier?: { tier: number; campaign: number; campaignId?: string };
  /** Redeem: value of the points in SAR. */
  discountSAR?: number;
  /** Debits: the lots points were taken from. */
  from?: { lot: string; points: number }[];
  /** Back office: reason and who made the adjustment. */
  note?: string;
  by?: string;
  /** Sample entry (sandbox mode). */
  demo?: boolean;
}

export interface LoyaltyAccount {
  /** The user id. */
  id: string;
  userId: string;
  referralCode: string;
  /** User id of the member who invited this one. */
  referredBy: string | null;
  referralRewarded: boolean;
  createdAt: string;
  entries: LoyaltyEntry[];
  /** Points owed after a reversal that couldn't be covered (taken from the next points earned). */
  deficit: number;
  /** Expiry reminders already sent (expiry dates). */
  notified: string[];
  demoSeeded?: boolean;
}

export interface LoyaltyCampaign {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Purchase dates (Saudi time), inclusive. */
  from: string;
  to: string;
  multiplier: number;
  /** Empty: every service. */
  services: EarnService[];
  /** Destination cities (IATA codes); empty: everywhere. Applies to packages and events. */
  cities: string[];
  active: boolean;
  createdAt: string;
  createdBy: string;
}

export interface LoyaltySummary {
  eligible: boolean;
  available: number;
  pending: number;
  deficit: number;
  lifetimeEarned: number;
  tier: { id: string; multiplier: number };
  next: { id: string; minSpendSAR: number } | null;
  spend12mSAR: number;
  toNextSAR: number;
  expiring: { points: number; date: string } | null;
  referralCode: string | null;
  /** Campaigns running today (for the «you'll earn» line). */
  campaigns: Pick<LoyaltyCampaign, "id" | "nameAr" | "nameEn" | "multiplier" | "services" | "cities" | "to">[];
  demo: boolean;
}

/** Points used and earned on an order or booking (kept on it for display). */
export interface OrderLoyalty {
  redeemedPoints: number;
  discountSAR: number;
  earnedPoints: number;
}
