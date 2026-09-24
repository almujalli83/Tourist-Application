/** Server-side configuration (read from environment variables). */
export const VISA_INSURANCE_FEE_SAR = Number(process.env.VISA_INSURANCE_FEE_SAR ?? "402.21");

/** Package constraints from MT eVisa guide §10.4.2 and business validation codes §10.1. */
export const PACKAGE_LIMITS = {
  maxTravellers: 14,
  maxAdults: 9,
  maxMinors: 5,
  minorAgeLimit: 18,
  /** VTP004: package duration must be between 2 and 21 days. */
  minPackageDays: 2,
  maxPackageDays: 21,
  /** VTP010: purchase-to-travel window must be between 2 and 80 days. */
  minLeadDays: 2,
  maxLeadDays: 80,
  /** VTP003: hotel star rating must be 4 or above. */
  minHotelStars: 4,
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
