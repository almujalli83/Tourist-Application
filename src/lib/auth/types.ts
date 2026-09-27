import { isAdminEmail } from "../config";
import type { AccountType } from "../types";

export interface IndividualProfile {
  fullName: string;
  phone: string;
  nationality: string;
}

export interface CompanyProfile {
  companyName: string;
  commercialRegNo: string;
  tourismLicenseNo: string;
  vatNo: string;
  contactPerson: string;
  phone: string;
  city: string;
}

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  accountType: AccountType;
  individual?: IndividualProfile;
  company?: CompanyProfile;
  preferredLocale: "ar" | "en";
  preferredCurrency: string;
  createdAt: string;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  /** The verified number (the profile's number may change afterwards). */
  verifiedPhone?: string;
  passwordChangedAt?: string;
  /** Two-step sign-in with an authenticator app. */
  mfa?: { secret: string; enabledAt: string; recovery: string[] };
  /** Accounts created with Google, Apple, Nafath or a mobile number have no password until they set one. */
  hasPassword?: boolean;
  deletedAt?: string;
}

export type PublicUser = Omit<StoredUser, "passwordHash" | "mfa"> & { isAdmin?: boolean; mfaEnabled?: boolean };

/** Server-side only (reads ADMIN_EMAILS). */
export function toPublicUser(u: StoredUser): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, mfa, ...rest } = u;
  const pub: PublicUser = { ...rest, ...(mfa ? { mfaEnabled: true } : {}) };
  return isAdminEmail(u.email) ? { ...pub, isAdmin: true } : pub;
}

export function displayName(u: PublicUser): string {
  return u.accountType === "company" ? u.company?.companyName ?? u.email : u.individual?.fullName ?? u.email;
}
