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
}

export type PublicUser = Omit<StoredUser, "passwordHash"> & { isAdmin?: boolean };

/** Server-side only (reads ADMIN_EMAILS). */
export function toPublicUser(u: StoredUser): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = u;
  return isAdminEmail(u.email) ? { ...rest, isAdmin: true } : rest;
}

export function displayName(u: PublicUser): string {
  return u.accountType === "company" ? u.company?.companyName ?? u.email : u.individual?.fullName ?? u.email;
}
