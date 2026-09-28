/**
 * The tourist eVisa channel for eligible nationalities (no package), connected by API: one
 * application per traveller, then its decision (visa number and validity) and the eVisa document.
 *
 * Configured with EVISA_API_URL and EVISA_API_TOKEN. Expected endpoints (to be matched with the
 * channel's specification when the agreement is signed):
 *   POST {url}/applications        { reference, applicant, travel, security, insurance } → { applicationRef, status }
 *   GET  {url}/applications/{ref}  → { status, visaNumber?, issueDate?, expiryDate?, insuranceStatus?, reason? }
 * Sandbox (no URL configured): applications are approved about a minute after submission; an
 * applicant named "SANDBOX REJECT" is refused (for tests).
 */
import { createHash } from "node:crypto";

export type EvisaDecision = "submitted" | "in_review" | "approved" | "rejected";

export class EvisaProviderError extends Error {
  constructor(public code: "unavailable" | "rejected", public detail = "") {
    super(code);
  }
}

/** What the channel receives for one applicant: the same data as a package's visa request. */
export interface EvisaPayload {
  reference: string;
  applicant: {
    firstNameEn: string; middleNameEn: string | null; grandFatherNameEn: string | null; familyNameEn: string;
    firstNameAr: string | null; middleNameAr: string | null; grandFatherNameAr: string | null; familyNameAr: string | null;
    birthDate: string; birthplace: string; gender: "1" | "2"; job: string; nationality: string;
    passportNo: string; passportType: string; passportIssueDate: string; passportExpiryDate: string; passportIssuePlace: string;
    religion: string; maritalStatus: string; email: string; mobileNo: string; zipCode: string | null;
    personPhoto: string; passportImage: string;
    companionType: string | null; sponsorApplicationRef: string | null;
  };
  travel: { purpose: "Tourism"; arrivalDate: string; requestInitiatedBy?: string };
  security: Record<string, { answer: "true" | "false"; clarification: string | null } | "true" | "false">;
  insurance: Record<string, string>;
}

export interface EvisaState { status: EvisaDecision; visaNumber: string | null; issueDate: string | null; expiryDate: string | null; insuranceStatus: string | null; reason: string | null }

export interface EvisaProvider {
  sandbox: boolean;
  submit(p: EvisaPayload): Promise<{ applicationRef: string; status: EvisaDecision }>;
  status(ref: string, submittedAt: string, now: Date): Promise<EvisaState>;
}

const DECISIONS: EvisaDecision[] = ["submitted", "in_review", "approved", "rejected"];

function apiProvider(url: string, token: string): EvisaProvider {
  const base = url.replace(/\/$/, "");
  const headers = { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
    } catch {
      throw new EvisaProviderError("unavailable");
    }
    const body = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (res.status === 400 || res.status === 409 || res.status === 422) throw new EvisaProviderError("rejected", String(body.message ?? ""));
    if (!res.ok) throw new EvisaProviderError("unavailable");
    return body;
  }
  return {
    sandbox: false,
    async submit(p) {
      const r = await call<{ applicationRef?: string; status?: string }>("/applications", { method: "POST", body: JSON.stringify(p) });
      if (!r.applicationRef) throw new EvisaProviderError("unavailable");
      return { applicationRef: r.applicationRef, status: DECISIONS.includes(r.status as EvisaDecision) ? (r.status as EvisaDecision) : "submitted" };
    },
    async status(ref) {
      const r = await call<Partial<EvisaState>>(`/applications/${encodeURIComponent(ref)}`);
      return {
        status: DECISIONS.includes(r.status as EvisaDecision) ? (r.status as EvisaDecision) : "in_review",
        visaNumber: r.visaNumber ?? null, issueDate: r.issueDate ?? null, expiryDate: r.expiryDate ?? null,
        insuranceStatus: r.insuranceStatus ?? null, reason: r.reason ?? null,
      };
    },
  };
}

/** Decided a minute after submission; one-year multiple-entry visa from the approval day. */
const SANDBOX_DECISION_MS = 60_000;
/** A refusal is written into the sandbox reference itself, so it survives restarts. */
const REJECT_TAG = "SBXR";

const sandboxProvider: EvisaProvider = {
  sandbox: true,
  async submit(p) {
    const refuse = `${p.applicant.firstNameEn} ${p.applicant.familyNameEn}`.toUpperCase() === "SANDBOX REJECT";
    const ref = `${refuse ? REJECT_TAG : "SBXA"}${createHash("sha256").update(`${p.reference}:${p.applicant.passportNo}`).digest("hex").slice(0, 10).toUpperCase()}`;
    return { applicationRef: ref, status: "submitted" };
  },
  async status(ref, submittedAt, now) {
    const age = now.getTime() - Date.parse(submittedAt);
    if (age < SANDBOX_DECISION_MS) return { status: "in_review", visaNumber: null, issueDate: null, expiryDate: null, insuranceStatus: null, reason: null };
    if (ref.startsWith(REJECT_TAG)) return { status: "rejected", visaNumber: null, issueDate: null, expiryDate: null, insuranceStatus: null, reason: "Sandbox refusal" };
    const issued = new Date(Date.parse(submittedAt) + SANDBOX_DECISION_MS);
    const expiry = new Date(issued.getTime() + 365 * 86_400_000);
    const digits = String(parseInt(createHash("sha256").update(ref).digest("hex").slice(0, 10), 16)).slice(0, 10).padStart(10, "0");
    return { status: "approved", visaNumber: digits, issueDate: issued.toISOString().slice(0, 10), expiryDate: expiry.toISOString().slice(0, 10), insuranceStatus: "ISSUED", reason: null };
  },
};

export function evisaProvider(): EvisaProvider {
  const url = process.env.EVISA_API_URL?.trim();
  return url ? apiProvider(url, process.env.EVISA_API_TOKEN?.trim() ?? "") : sandboxProvider;
}
