/** Server-side configuration (read from environment variables). */
const DEFAULT_VISA_FEE_SAR = 402.21;
const configuredFee = Number(process.env.VISA_INSURANCE_FEE_SAR);
/** Visa + insurance fee per traveller; an empty or invalid setting falls back to 402.21 SAR. */
export const VISA_INSURANCE_FEE_SAR =
  process.env.VISA_INSURANCE_FEE_SAR?.trim() && Number.isFinite(configuredFee) && configuredFee > 0
    ? configuredFee
    : DEFAULT_VISA_FEE_SAR;

/** Package constraints from MT eVisa guide §10.4.2 and business validation codes §10.1. */
/** Key package rules (MT "Key Package Requirements" v1.3). */
export const PACKAGE_LIMITS = {
  maxTravellers: 14,
  maxAdults: 9,
  maxMinors: 5,
  /** Travellers under 18 are minors: max 5 per package and not counted in the minimum price. */
  minorAgeLimit: 18,
  /** Package duration: 2 to 88 days. */
  minPackageDays: 2,
  maxPackageDays: 88,
  /** Purchase-to-travel window: at least 3 days (the 80-day maximum is from the eVisa integration guide, VTP010). */
  minLeadDays: 3,
  maxLeadDays: 80,
  /** Accommodation: MT-licensed hotels of 3 stars or more. */
  minHotelStars: 3,
  /** Minimum package price per adult (18+) for the minimum duration; covers flights, hotels, activities and visa & insurance. */
  minPricePerAdultSAR: 2000,
  /** Added to the per-adult minimum for each day beyond the minimum duration. */
  extraDayPerAdultSAR: 1000,
  passportValidityMonths: 6,
} as const;

export type MtEnv = "dev" | "stage" | "production";

export const MT_BASE_URLS: Record<MtEnv, string> = {
  dev: "https://dev-api.tourism.sa/gateway",
  stage: "https://stg-api.tourism.sa/gateway",
  production: "https://api.tourism.sa/gateway",
};

export function mtConfig() {
  const env = (process.env.MT_ENV as MtEnv) || "dev";
  return {
    env,
    baseUrl: MT_BASE_URLS[env] ?? MT_BASE_URLS.dev,
    dmcId: process.env.MT_DMC_ID ?? "",
    clientId: process.env.MT_CLIENT_ID ?? "",
    clientSecret: process.env.MT_CLIENT_SECRET ?? "",
    otaLicenseNo: process.env.MT_OTA_LICENSE_NO ?? "",
    /** Without credentials the integration runs in mock mode. */
    mock: !process.env.MT_CLIENT_ID,
  };
}
