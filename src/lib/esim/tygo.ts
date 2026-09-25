/**
 * eSIM adapter (Tygo). Plans, durations and each plan's refund terms come from the provider; until
 * the Tygo API is connected the sandbox catalogue below is served. Two kinds of plan: data only,
 * and data with a Saudi number (calls and SMS).
 */
import { randomBytes, randomInt } from "node:crypto";

export type EsimKind = "data" | "dataVoice";

export interface EsimPlan {
  id: string;
  kind: EsimKind;
  days: number;
  /** null = unlimited (fair use). */
  dataGB: number | null;
  /** Local minutes included (data + number plans). */
  minutes: number;
  priceSAR: number;
  /** Refundable while the eSIM has not been installed / activated. */
  refundableBeforeActivation: boolean;
}

const PLANS: EsimPlan[] = [
  { id: "tygo-d7-5", kind: "data", days: 7, dataGB: 5, minutes: 0, priceSAR: 69, refundableBeforeActivation: true },
  { id: "tygo-d15-15", kind: "data", days: 15, dataGB: 15, minutes: 0, priceSAR: 119, refundableBeforeActivation: true },
  { id: "tygo-d30-30", kind: "data", days: 30, dataGB: 30, minutes: 0, priceSAR: 179, refundableBeforeActivation: true },
  { id: "tygo-d30-unl", kind: "data", days: 30, dataGB: null, minutes: 0, priceSAR: 249, refundableBeforeActivation: true },
  { id: "tygo-d90-50", kind: "data", days: 90, dataGB: 50, minutes: 0, priceSAR: 299, refundableBeforeActivation: true },
  { id: "tygo-v7-5", kind: "dataVoice", days: 7, dataGB: 5, minutes: 60, priceSAR: 99, refundableBeforeActivation: true },
  { id: "tygo-v15-15", kind: "dataVoice", days: 15, dataGB: 15, minutes: 120, priceSAR: 159, refundableBeforeActivation: true },
  { id: "tygo-v30-30", kind: "dataVoice", days: 30, dataGB: 30, minutes: 300, priceSAR: 229, refundableBeforeActivation: false },
  { id: "tygo-v90-50", kind: "dataVoice", days: 90, dataGB: 50, minutes: 500, priceSAR: 349, refundableBeforeActivation: false },
];

export const tygoMode = () => "sandbox" as const;

export function listPlans(): EsimPlan[] {
  return PLANS;
}

export const getPlan = (id: string) => PLANS.find((p) => p.id === id) ?? null;

/** Shortest plan of a kind that covers the trip (the longest one if none does). */
export function suggestPlan(kind: EsimKind, tripDays: number): EsimPlan {
  const list = PLANS.filter((p) => p.kind === kind && p.dataGB !== null).sort((a, b) => a.days - b.days || a.priceSAR - b.priceSAR);
  return list.find((p) => p.days >= tripDays) ?? list[list.length - 1];
}

export interface IssuedEsim {
  iccid: string;
  /** LPA activation string encoded in the installation QR code. */
  activationCode: string;
  smdpAddress: string;
  matchingId: string;
  phoneNumber: string | null;
}

/** Issues one eSIM profile per traveller (sandbox: generated here). */
export async function tygoIssue(plan: EsimPlan, count: number): Promise<{ orderRef: string; esims: IssuedEsim[] }> {
  const smdp = "smdp.sandbox.tygo.example";
  return {
    orderRef: `TY-${randomBytes(4).toString("hex").toUpperCase()}`,
    esims: Array.from({ length: count }, () => {
      const matchingId = randomBytes(8).toString("hex").toUpperCase();
      return {
        iccid: `8996601${String(randomInt(0, 1e9)).padStart(9, "0")}${String(randomInt(0, 1e4)).padStart(4, "0")}`,
        activationCode: `LPA:1$${smdp}$${matchingId}`,
        smdpAddress: smdp,
        matchingId,
        phoneNumber: plan.kind === "dataVoice" ? `+9665${String(randomInt(0, 1e8)).padStart(8, "0")}` : null,
      };
    }),
  };
}

/** Activation status per ICCID (sandbox: not activated). */
export async function tygoActivated(iccid: string): Promise<boolean> {
  return !iccid;
}

export async function tygoCancel(orderRef: string): Promise<boolean> {
  return !!orderRef;
}
