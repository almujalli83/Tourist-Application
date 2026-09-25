/**
 * MT OTA eVisa Integration API client (guide v1.7).
 * Live mode: Basic auth → getAccessToken → Bearer calls.
 * Sandbox mode (no MT_CLIENT_ID): simulates MT behaviour so the journey can be tested end-to-end.
 */
import { randomUUID } from "node:crypto";
import { mtConfig } from "../config";
import { getSandboxPackage, updateSandboxPackage, upsertSandboxPackage } from "../repo";
import { SANDBOX_LOOKUPS } from "./lookups";
import { SANDBOX_PRIVACY_POLICY } from "./privacy";
import type {
  MtLookupItem, MtLookupName, MtLookupResponse, PackageStatusResponse, PrivacyPolicyResponse,
  SubmitTourismPackageRequest, SubmitTourismPackageResponse, UpdateTravelDetailsRequest, UpdateTravelDetailsResponse,
} from "./types";

export class MtApiError extends Error {
  constructor(public codes: string[], public correlationId?: string, message?: string) {
    super(message ?? `MT API error: ${codes.join(", ")}`);
  }
}

export interface MtClient {
  mode: "live" | "sandbox";
  getLookup(name: MtLookupName): Promise<MtLookupItem[]>;
  getPrivacyPolicy(): Promise<PrivacyPolicyResponse>;
  submitTourismPackage(req: SubmitTourismPackageRequest): Promise<SubmitTourismPackageResponse>;
  getTourismPackageStatus(packageId: string): Promise<PackageStatusResponse>;
  cancelTourismPackage(packageId: string): Promise<{ correlationId: string; errorCodes: string[] }>;
  /** Updates the travel details of one visa-granted applicant (§8, updateTravellerTravelDetails). */
  updateTravellerTravelDetails(req: UpdateTravelDetailsRequest): Promise<UpdateTravelDetailsResponse>;
}

const isOk = (codes?: string[]) => !codes || codes.length === 0 || codes.every((c) => String(c) === "0");

/* ------------------------------------------------------------------ live */

function createLiveClient(): MtClient {
  const cfg = mtConfig();
  let token: { value: string; expires: number } | null = null;
  const lookupCache = new Map<string, { items: MtLookupItem[]; expires: number }>();

  async function accessToken(): Promise<string> {
    if (token && token.expires > Date.now() + 30_000) return token.value;
    const res = await fetch(`${cfg.baseUrl}/MTOTATokenAPI/1.0/getAccessToken`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      },
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.accessToken) throw new MtApiError(body.errorCodes ?? [String(res.status)], body.correlationId);
    token = { value: body.accessToken, expires: Date.now() + Number(body.expiresInSeconds ?? 3600) * 1000 };
    return token.value;
  }

  async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as T & { errorCodes?: string[]; correlationId?: string };
    if (!res.ok && !body.errorCodes) throw new MtApiError([String(res.status)]);
    return body;
  }

  return {
    mode: "live",
    async getLookup(name) {
      const hit = lookupCache.get(name);
      if (hit && hit.expires > Date.now()) return hit.items;
      const body = await call<MtLookupResponse>(`/mtotalookup/1.0/${name}`, { method: "GET" });
      const codes = body.errorCodes ?? body.errorCode;
      if (!isOk(codes) || !body.data) throw new MtApiError(codes ?? ["500"], body.correlationId);
      lookupCache.set(name, { items: body.data, expires: Date.now() + 6 * 3600_000 });
      return body.data;
    },
    async getPrivacyPolicy() {
      const body = await call<PrivacyPolicyResponse>(`/MTOTAServices/1.0/getPrivacyPolicy`, { method: "GET" });
      if (!isOk(body.errorCodes)) throw new MtApiError(body.errorCodes ?? [], body.correlationId);
      return body;
    },
    submitTourismPackage: (req) =>
      call<SubmitTourismPackageResponse>(`/MTOTAServices/1.0/submitTourismPackage`, { method: "POST", body: req }),
    getTourismPackageStatus: (packageId) =>
      // The guide documents this GET endpoint with a JSON body { dmcId, packageId }; sent as POST-compatible body.
      call<PackageStatusResponse>(`/MTOTAServices/1.0/getTourismPackageStatus`, {
        method: "POST",
        body: { dmcId: cfg.dmcId, packageId },
      }),
    cancelTourismPackage: (packageId) =>
      call(`/MTOTAServices/1.0/cancelTourismPackage`, { method: "POST", body: { dmcId: cfg.dmcId, packageId } }),
    updateTravellerTravelDetails: (req) =>
      call<UpdateTravelDetailsResponse>(`/MTOTAServices/1.0/updateTravellerTravelDetails`, { method: "POST", body: req }),
  };
}

/* --------------------------------------------------------------- sandbox */

/** Simulated MT status progression (seconds after submission). */
const SANDBOX_TIMELINE: [number, string, string][] = [
  [0, "RECEIVED", "RECEIVED"],
  [20, "VALIDATION_PASSED", "VALID"],
  [40, "PAYMENT_COMPLETED", "VALID"],
  [60, "PROCESSING", "PROCESSING"],
  [90, "COMPLETED", "COMPLETED"],
];

function createSandboxClient(): MtClient {
  return {
    mode: "sandbox",
    async getLookup(name) {
      return SANDBOX_LOOKUPS[name];
    },
    async getPrivacyPolicy() {
      return { ...SANDBOX_PRIVACY_POLICY, correlationId: randomUUID(), errorCodes: ["0"] };
    },
    async submitTourismPackage(req) {
      const v = req.visitorData[0];
      const errors: { errorCode: string; errorMessage: string }[] = [];
      if (v.disclaimerAnswered !== "Yes") errors.push({ errorCode: "STP002", errorMessage: "Disclaimer must be accepted." });
      if (!req.applicationNoList.includes(v.applicationNo))
        errors.push({ errorCode: "STP002", errorMessage: "applicationNo not in applicationNoList." });
      if (errors.length)
        return { correlationId: randomUUID(), applicationNo: v.applicationNo, applicationStatus: errors, errorCodes: ["400"] };

      // Same messageId → same package (§2.2 key condition 1).
      const packageId = req.packageId || `pkg-${req.messageId}`;
      const app = {
        applicationNo: v.applicationNo,
        name: `${v.firstNameEn} ${v.familyNameEn}`,
        countryId: v.nationality,
        passportNo: v.passportNo,
      };
      await upsertSandboxPackage(packageId, (pkg) => ({
        ...pkg,
        applications: [...pkg.applications.filter((a) => a.applicationNo !== v.applicationNo), app],
      }));
      return { correlationId: randomUUID(), packageId, errorCodes: ["0"] };
    },
    async getTourismPackageStatus(packageId) {
      const pkg = await getSandboxPackage(packageId);
      if (!pkg) return { correlationId: randomUUID(), packageId, errorCodes: ["TP007"] };
      const elapsed = (Date.now() - Date.parse(pkg.submittedAt)) / 1000;
      const [, pkgStatus, appStatus] = pkg.cancelled
        ? [0, "CANCELLED", "FAILED"]
        : [...SANDBOX_TIMELINE].reverse().find(([t]) => elapsed >= t)!;
      const done = pkgStatus === "COMPLETED";
      const issue = pkg.submittedAt.slice(0, 10);
      const expiry = new Date(Date.parse(pkg.submittedAt) + 365 * 86_400_000).toISOString().slice(0, 10);
      return {
        correlationId: randomUUID(),
        packageId,
        tourismPackageStatus: pkgStatus,
        tourismPackageErrorCode: "0",
        travellerList: pkg.applications.map((a) => ({
          ...a,
          visaNumber: done ? `60${a.applicationNo.slice(-8)}` : null,
          visaIssueDate: done ? issue : null,
          visaExpiryDate: done ? expiry : null,
          appValidationError: [0],
          appStatus,
          visaStatus: done ? "ISSUED" : pkgStatus === "PROCESSING" ? "IN_PROGRESS" : null,
          insuranceStatus: done ? "ISSUED" : pkgStatus === "PROCESSING" ? "IN_PROGRESS" : null,
        })),
        errorCodes: ["0"],
      };
    },
    async cancelTourismPackage(packageId) {
      let ok = false;
      await updateSandboxPackage(packageId, (pkg) => {
        const elapsed = (Date.now() - Date.parse(pkg.submittedAt)) / 1000;
        if (elapsed >= 40) return pkg; // beyond validated stage
        ok = true;
        return { ...pkg, cancelled: true };
      });
      return { correlationId: randomUUID(), errorCodes: [ok ? "0" : "CTP001"] };
    },
    async updateTravellerTravelDetails(req) {
      // Mirrors the §8 validations that apply in the sandbox.
      const fail = (code: string) => ({ correlationId: randomUUID(), errorCodes: [code] });
      const pkg = await getSandboxPackage(req.packageId);
      const v = req.visitorData;
      if (!pkg || !pkg.applications.some((a) => a.applicationNo === v.applicationNo)) return fail("UTD005");
      const issued = (Date.now() - Date.parse(pkg.submittedAt)) / 1000 >= SANDBOX_TIMELINE[SANDBOX_TIMELINE.length - 1][0];
      if (!issued || pkg.cancelled) return fail("UTD006");
      const expiry = new Date(Date.parse(pkg.submittedAt) + 365 * 86_400_000).toISOString().slice(0, 10);
      if (v.arrivalAndDepartureData.departureDate > expiry) return fail("UTD008");
      if (Number(v.generalPackageData.packageDuration) < 2) return fail("UTD013");
      if (v.accommodationData.some((h) => !h.licenseNo)) return fail("UTD009");
      return { correlationId: randomUUID(), errorCodes: ["0"] };
    },
  };
}

let instance: MtClient | null = null;

export function getMtClient(): MtClient {
  return (instance ??= mtConfig().mock ? createSandboxClient() : createLiveClient());
}

export { isOk as mtIsOk };
