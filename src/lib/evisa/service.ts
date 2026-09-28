/**
 * Tourist eVisa without a package, for eligible nationalities (see eligibility.ts): the same
 * traveller data as a package's visa (passport read by OCR, photo, fields, security and health
 * questionnaires), family and group applications with companions, individuals and companies.
 * One payment for the visa & insurance fee of every traveller; each traveller is one application
 * to the eVisa channel. Passport images and photos are sent to the channel only, never stored.
 * The fee is a government fee: no reward points, and no refund once the application is submitted
 * (an application the channel couldn't take is refunded).
 */
import { randomBytes } from "node:crypto";
import type { PublicUser } from "../auth/types";
import { PACKAGE_LIMITS, VISA_INSURANCE_FEE_SAR } from "../config";
import { addDays, isValidISODate, todayISO } from "../dates";
import { notifyTravellers } from "../notify";
import { chargeCard, refundPayment, type CardInput } from "../payment";
import type { AppNotification } from "../reminders/reminders";
import { store } from "../store";
import type { Traveller } from "../types";
import { validateEvisaTravellers } from "./validate";
export { validateEvisaTravellers } from "./validate";
import { evisaProvider, EvisaProviderError, type EvisaDecision, type EvisaPayload } from "./provider";

export class EvisaError extends Error {
  constructor(public code: string, public status = 422, public details?: unknown) {
    super(code);
  }
}

/** Visa & insurance fee per traveller (EVISA_FEE_SAR; by default the same as a package's). */
export function evisaFeeSAR(): number {
  const v = Number(process.env.EVISA_FEE_SAR);
  return process.env.EVISA_FEE_SAR?.trim() && Number.isFinite(v) && v > 0 ? v : VISA_INSURANCE_FEE_SAR;
}

export type ApplicantStatus = EvisaDecision | "failed" | "not_submitted";

export interface EvisaApplicant {
  paxType: Traveller["paxType"];
  nameEn: string;
  nationality: string;
  passportMasked: string;
  email: string;
  sponsorIndex: number | null;
  companionType: string | null;
  applicationRef: string | null;
  status: ApplicantStatus;
  error: string | null;
  submittedAt: string | null;
  visaNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  insuranceStatus: string | null;
  reason: string | null;
  refundedSAR: number;
}

export interface EvisaApplication {
  id: string;
  reference: string;
  accountType: PublicUser["accountType"];
  /** Company accounts: their own reference for the client. */
  clientReference: string | null;
  arrivalDate: string;
  applicants: EvisaApplicant[];
  feePerTravellerSAR: number;
  totalSAR: number;
  refundedSAR: number;
  payment: { transactionId: string; method: string; last4: string; amountSAR: number; paidAt: string };
  status: "in_progress" | "completed" | "failed";
  createdAt: string;
  lastCheckedAt: string | null;
  sandbox?: boolean;
}

type Stored = EvisaApplication & { userId: string };
const COL = "evisaApps" as const;
const round2 = (n: number) => Math.round(n * 100) / 100;
const strip = ({ userId: _u, ...a }: Stored): EvisaApplication => a; // eslint-disable-line @typescript-eslint/no-unused-vars
const mask = (p: string) => (p.length > 4 ? `${"•".repeat(p.length - 4)}${p.slice(-4)}` : p);
const orNull = (s: string) => (s.trim() ? s.trim() : null);
const FINAL: ApplicantStatus[] = ["approved", "rejected", "failed", "not_submitted"];

export interface EvisaInput {
  arrivalDate?: string;
  travellers?: Traveller[];
  disclaimerAccepted?: boolean;
  clientReference?: string;
  expectedTotalSAR?: number;
  card?: CardInput;
}

function payload(t: Traveller, reference: string, arrivalDate: string, sponsorRef: string | null, initiatedBy?: string): EvisaPayload {
  const s = t.security;
  const clar = (a: { answer: string; clarification: string }) => ({ answer: a.answer as "true" | "false", clarification: a.answer === "true" ? a.clarification.trim() : null });
  return {
    reference,
    applicant: {
      firstNameEn: t.firstNameEn.trim(), middleNameEn: orNull(t.middleNameEn), grandFatherNameEn: orNull(t.grandFatherNameEn), familyNameEn: t.familyNameEn.trim(),
      firstNameAr: orNull(t.firstNameAr), middleNameAr: orNull(t.middleNameAr), grandFatherNameAr: orNull(t.grandFatherNameAr), familyNameAr: orNull(t.familyNameAr),
      birthDate: t.birthDate, birthplace: t.birthplace, gender: t.gender as "1" | "2", job: t.job.trim(), nationality: t.nationality,
      passportNo: t.passportNo.trim().toUpperCase(), passportType: t.passportType, passportIssueDate: t.passportIssueDate, passportExpiryDate: t.passportExpiryDate, passportIssuePlace: t.passportIssuePlace,
      religion: t.religion, maritalStatus: t.maritalStatus, email: t.email.trim(), mobileNo: t.mobileNo, zipCode: orNull(t.zipCode),
      personPhoto: t.personPhoto.slice(t.personPhoto.indexOf(",") + 1), passportImage: t.passportImage.slice(t.passportImage.indexOf(",") + 1),
      companionType: sponsorRef ? t.companionType || null : null, sponsorApplicationRef: sponsorRef,
    },
    travel: { purpose: "Tourism", arrivalDate, ...(initiatedBy ? { requestInitiatedBy: initiatedBy } : {}) },
    security: {
      moneyLaunderingOffence: clar(s.moneyLaunderingOffence), servedJailTime: clar(s.servedJailTime), servedInMilitary: clar(s.servedInMilitary),
      workedInPoliticsOrMedia: clar(s.workedInPoliticsOrMedia), joinedOrganizationOrParty: clar(s.joinedOrganizationOrParty),
      beenDeported: s.beenDeported as "true" | "false", crimeFromInterpool: s.crimeFromInterpool as "true" | "false", passportRestricted: s.passportRestricted as "true" | "false",
    },
    insurance: { ...t.insurance },
  };
}

/** Submits every traveller's eVisa application after one payment for all the fees. */
export async function applyForEvisa(user: PublicUser, input: EvisaInput, now = new Date()): Promise<EvisaApplication> {
  const today = todayISO();
  const arrivalDate = String(input.arrivalDate ?? "");
  if (!isValidISODate(arrivalDate) || arrivalDate < today || arrivalDate > addDays(today, 365)) throw new EvisaError("arrivalDate");
  const travellers = Array.isArray(input.travellers) ? input.travellers : [];
  if (!travellers.length || travellers.length > PACKAGE_LIMITS.maxTravellers) throw new EvisaError("travellers");
  if (!input.disclaimerAccepted) throw new EvisaError("disclaimerRequired");
  const { errors, composition } = validateEvisaTravellers(travellers, arrivalDate, today);
  if (errors.some((e) => Object.keys(e).length)) throw new EvisaError("invalidTravellers", 422, errors);
  if (composition.length) throw new EvisaError("invalidComposition", 422, composition);

  const fee = evisaFeeSAR();
  const total = round2(fee * travellers.length);
  if (Math.abs(total - Number(input.expectedTotalSAR)) > 0.009) throw new EvisaError("priceChanged", 409, { totalSAR: total });
  if (!input.card) throw new EvisaError("invalid_card");
  const paid = await chargeCard(input.card, total, now);
  if (!paid.ok) throw new EvisaError(`payment_${paid.code}`, 402);

  const provider = evisaProvider();
  const id = randomBytes(10).toString("hex");
  const reference = `EV-${randomBytes(3).toString("hex").toUpperCase()}`;
  const initiatedBy = user.accountType === "company" ? user.company?.companyName : undefined;
  const applicants: EvisaApplicant[] = travellers.map((t) => ({
    paxType: t.paxType, nameEn: [t.firstNameEn, t.familyNameEn].join(" ").trim().toUpperCase(), nationality: t.nationality,
    passportMasked: mask(t.passportNo.trim().toUpperCase()), email: t.email.trim(), sponsorIndex: t.sponsorIndex, companionType: t.sponsorIndex !== null ? t.companionType || null : null,
    applicationRef: null, status: "not_submitted", error: null, submittedAt: null,
    visaNumber: null, issueDate: null, expiryDate: null, insuranceStatus: null, reason: null, refundedSAR: 0,
  }));
  // Sponsors first, so each dependent can name its sponsor's application.
  const order = travellers.map((_, i) => i).sort((a, b) => Number(travellers[a].sponsorIndex !== null) - Number(travellers[b].sponsorIndex !== null));
  for (const i of order) {
    const sponsor = travellers[i].sponsorIndex;
    const sponsorRef = sponsor !== null ? applicants[sponsor]?.applicationRef ?? null : null;
    if (sponsor !== null && !sponsorRef) {
      applicants[i].error = "sponsorNotSubmitted";
      continue;
    }
    try {
      const r = await provider.submit(payload(travellers[i], `${reference}-${i + 1}`, arrivalDate, sponsorRef, initiatedBy));
      Object.assign(applicants[i], { applicationRef: r.applicationRef, status: r.status, submittedAt: now.toISOString() });
    } catch (e) {
      applicants[i].status = "failed";
      applicants[i].error = e instanceof EvisaProviderError ? (e.code === "rejected" ? "channelRejected" : "channelUnavailable") : "channelUnavailable";
    }
  }
  // An application the channel couldn't take is refunded (its fee only).
  let refunded = 0;
  for (const a of applicants) {
    if (a.applicationRef) continue;
    a.status = a.status === "failed" ? "failed" : "not_submitted";
    a.refundedSAR = fee;
    refunded = round2(refunded + fee);
  }
  if (refunded > 0) await refundPayment(paid.transactionId, refunded);
  const submitted = applicants.some((a) => a.applicationRef);
  const app: Stored = {
    id, userId: user.id, reference, accountType: user.accountType, clientReference: input.clientReference?.trim().slice(0, 60) || null,
    arrivalDate, applicants, feePerTravellerSAR: fee, totalSAR: total, refundedSAR: refunded,
    payment: { transactionId: paid.transactionId, method: paid.method, last4: paid.last4, amountSAR: total, paidAt: now.toISOString() },
    status: submitted ? "in_progress" : "failed", createdAt: now.toISOString(), lastCheckedAt: null,
    ...(provider.sandbox ? { sandbox: true } : {}),
  };
  await store().put(COL, id, app);
  await notifyTravellers([user.email], {
    subject: `Saudi Trip — tourist eVisa application ${reference}`,
    text: [
      ...applicants.map((a) => `${a.nameEn} (${a.passportMasked}): ${a.applicationRef ? `submitted, application ${a.applicationRef}` : "not submitted — fee refunded"}`),
      `Paid: SAR ${total}${refunded ? `, refunded SAR ${refunded}` : ""}. You'll be notified of the decision.`,
      "",
      ...applicants.map((a) => `${a.nameEn}: ${a.applicationRef ? `قُدّم الطلب برقم ${a.applicationRef}` : "لم يُقدَّم — استُردت رسومه"}`),
      "سنبلغك بقرار التأشيرة فور صدوره.",
    ].join("\n"),
  }).catch(() => undefined);
  return strip(app);
}

export async function listEvisaApplications(userId: string): Promise<EvisaApplication[]> {
  return (await store().findBy<Stored>(COL, "userId", userId)).map(strip).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The application, with each pending decision asked of the channel again. */
export async function getEvisaApplication(user: PublicUser, id: string, now = new Date()): Promise<EvisaApplication | null> {
  const app = await store().get<Stored>(COL, id);
  if (!app || app.userId !== user.id) return null;
  const pending = app.applicants.filter((a) => a.applicationRef && !FINAL.includes(a.status));
  if (!pending.length) return strip(app);
  const provider = evisaProvider();
  const updates = new Map<string, Awaited<ReturnType<typeof provider.status>>>();
  for (const a of pending) {
    try {
      updates.set(a.applicationRef!, await provider.status(a.applicationRef!, a.submittedAt ?? app.createdAt, now));
    } catch {
      // The channel is unreachable: keep the last known state.
    }
  }
  const decided: EvisaApplicant[] = [];
  const done = await store().update<Stored>(COL, id, (x) => {
    const applicants = x.applicants.map((a) => {
      const u = a.applicationRef ? updates.get(a.applicationRef) : undefined;
      if (!u || u.status === a.status) return a;
      const next = { ...a, status: u.status, visaNumber: u.visaNumber, issueDate: u.issueDate, expiryDate: u.expiryDate, insuranceStatus: u.insuranceStatus, reason: u.reason };
      if (u.status === "approved" || u.status === "rejected") decided.push(next);
      return next;
    });
    const status = applicants.every((a) => FINAL.includes(a.status)) ? (applicants.some((a) => a.status === "approved") ? "completed" : "failed") : x.status;
    return { ...x, applicants, status, lastCheckedAt: now.toISOString() };
  });
  for (const a of decided) await notifyDecision(user, done!, a, now);
  return strip(done!);
}

async function notifyDecision(user: PublicUser, app: Stored, a: EvisaApplicant, now: Date) {
  const ok = a.status === "approved";
  const doc: AppNotification = {
    id: `evisa:${app.id}:${a.applicationRef}`, userId: user.id, kind: "evisa", bookingId: "", reference: app.reference, createdAt: now.toISOString(),
    href: `/account/evisa/${app.id}`, readAt: null, deletedAt: null, email: null,
    titleAr: ok ? `صدرت التأشيرة السياحية — ${a.nameEn}` : `رُفض طلب التأشيرة — ${a.nameEn}`,
    titleEn: ok ? `Tourist eVisa issued — ${a.nameEn}` : `eVisa application refused — ${a.nameEn}`,
    linesAr: ok ? [`رقم التأشيرة ${a.visaNumber} · صالحة حتى ${a.expiryDate}`, "احمل التأشيرة مع جواز السفر عند السفر."] : [a.reason ? `السبب: ${a.reason}` : "لم تُذكر الأسباب.", "يمكنك التقديم عبر باقة سياحية أو التواصل مع الدعم."],
    linesEn: ok ? [`Visa number ${a.visaNumber} · valid until ${a.expiryDate}`, "Carry the eVisa with your passport when you travel."] : [a.reason ? `Reason: ${a.reason}` : "No reason given.", "You can apply through a tourism package or contact support."],
  };
  if (!(await store().insert("notifications", doc.id, doc))) return;
  await notifyTravellers([...new Set([user.email, a.email])], { subject: `Saudi Trip — ${doc.titleEn} / ${doc.titleAr}`, text: [doc.titleEn, ...doc.linesEn, "", doc.titleAr, ...doc.linesAr].join("\n") }).catch(() => undefined);
}
