/**
 * Validation of traveller visa data against the MT eVisa SubmitTourismPackage rules (§2.4).
 * Returns a map of field path → error key (translated in the UI).
 */
import { PACKAGE_LIMITS } from "./config";
import { addMonths, ageOn, diffDays, isValidISODate } from "./dates";
import { getCountry, isArabCountry } from "./data/countries";
import type { ClarifiedAnswer, Traveller } from "./types";

export type FieldErrors = Record<string, string>;

export const SECURITY_CLARIFIED = [
  "moneyLaunderingOffence",
  "servedJailTime",
  "servedInMilitary",
  "workedInPoliticsOrMedia",
  "joinedOrganizationOrParty",
] as const;

export const SECURITY_SIMPLE = ["beenDeported", "crimeFromInterpool", "passportRestricted"] as const;

const LATIN_NAME = /^[A-Za-z][A-Za-z '\-]*$/;
const ARABIC_NAME = /^[؀-ۿ][؀-ۿ ً-ٟ]*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MOBILE = /^(\+|00)\d{7,13}$/;

export interface TravellerContext {
  arrivalDate: string;
  returnDate: string;
  today: string;
  travellerCount: number;
}

function req(errors: FieldErrors, key: string, value: string | undefined | null) {
  if (!value || !String(value).trim()) errors[key] = "required";
}

function name(errors: FieldErrors, key: string, value: string, required: boolean, arabic: boolean) {
  const v = value.trim();
  if (!v) {
    if (required) errors[key] = "required";
    return;
  }
  if (v.length > 15) errors[key] = "max15";
  else if (!(arabic ? ARABIC_NAME : LATIN_NAME).test(v)) errors[key] = arabic ? "arabicOnly" : "latinOnly";
}

/** Approximate decoded size of a base64 data URL in bytes. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.split(",")[1] ?? "";
  return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

export function isMinor(t: Pick<Traveller, "birthDate">, on: string): boolean {
  return isValidISODate(t.birthDate) && ageOn(t.birthDate, on) < PACKAGE_LIMITS.minorAgeLimit;
}

export function validateTraveller(t: Traveller, index: number, all: Traveller[], ctx: TravellerContext): FieldErrors {
  const e: FieldErrors = {};
  const arab = isArabCountry(t.nationality);

  name(e, "firstNameEn", t.firstNameEn, true, false);
  name(e, "middleNameEn", t.middleNameEn, false, false);
  name(e, "grandFatherNameEn", t.grandFatherNameEn, false, false);
  name(e, "familyNameEn", t.familyNameEn, true, false);
  name(e, "firstNameAr", t.firstNameAr, arab, true);
  name(e, "middleNameAr", t.middleNameAr, false, true);
  name(e, "grandFatherNameAr", t.grandFatherNameAr, false, true);
  name(e, "familyNameAr", t.familyNameAr, arab, true);

  // Birth date and consistency with the flight passenger type
  if (!isValidISODate(t.birthDate)) e.birthDate = "required";
  else if (diffDays(t.birthDate, ctx.today) < 0) e.birthDate = "future";
  else {
    const age = ageOn(t.birthDate, ctx.returnDate);
    const ageAtDeparture = ageOn(t.birthDate, ctx.arrivalDate);
    if (t.paxType === "infant" && age >= 2) e.birthDate = "infantAge";
    if (t.paxType === "child" && (ageAtDeparture < 2 || ageAtDeparture >= 12)) e.birthDate = "childAge";
    if (t.paxType === "adult" && ageAtDeparture < 12) e.birthDate = "adultAge";
  }

  if (!getCountry(t.birthplace)) e.birthplace = "required";
  if (t.gender !== "1" && t.gender !== "2") e.gender = "required";
  req(e, "job", t.job);
  if (t.job.trim().length > 20) e.job = "max20";
  if (!getCountry(t.nationality)) e.nationality = "required";

  // Passport
  const pn = t.passportNo.trim();
  if (!pn) e.passportNo = "required";
  else if (!/^[A-Z0-9]{5,12}$/i.test(pn)) e.passportNo = "passportFormat";
  if (!["1", "2", "3"].includes(t.passportType)) e.passportType = "required";
  if (!getCountry(t.passportIssuePlace)) e.passportIssuePlace = "required";
  if (!isValidISODate(t.passportIssueDate)) e.passportIssueDate = "required";
  else if (diffDays(t.passportIssueDate, ctx.today) < 0) e.passportIssueDate = "future";
  if (!isValidISODate(t.passportExpiryDate)) e.passportExpiryDate = "required";
  else if (diffDays(addMonths(ctx.arrivalDate, PACKAGE_LIMITS.passportValidityMonths), t.passportExpiryDate) < 0)
    e.passportExpiryDate = "passportValidity";
  if (isValidISODate(t.passportIssueDate) && isValidISODate(t.passportExpiryDate) && diffDays(t.passportIssueDate, t.passportExpiryDate) <= 0)
    e.passportExpiryDate = "expiryBeforeIssue";
  const dup = all.findIndex((o, i) => i !== index && pn && o.passportNo.trim().toUpperCase() === pn.toUpperCase());
  if (dup >= 0 && dup < index) e.passportNo = "duplicatePassport";

  if (t.religion !== "1" && t.religion !== "2") e.religion = "required";
  if (!["1", "2", "3", "4", "5"].includes(t.maritalStatus)) e.maritalStatus = "required";

  // Contact
  if (!t.email.trim()) e.email = "required";
  else if (!EMAIL.test(t.email.trim()) || t.email.trim().length > 50) e.email = "email";
  const mobile = t.mobileNo.replace(/[\s-]/g, "");
  if (!mobile) e.mobileNo = "required";
  else if (!MOBILE.test(mobile)) e.mobileNo = "mobile";
  if (t.zipCode.length > 15) e.zipCode = "max15";

  // Sponsorship (§10.4.1): minors must have an adult sponsor within the package.
  const minor = isValidISODate(t.birthDate) && isMinor(t, ctx.arrivalDate);
  if (t.sponsorIndex !== null) {
    const sponsor = all[t.sponsorIndex];
    if (!sponsor || t.sponsorIndex === index) e.sponsorIndex = "invalidSponsor";
    else if (isMinor(sponsor, ctx.arrivalDate)) e.sponsorIndex = "sponsorMinor";
    else if (sponsor.sponsorIndex !== null) e.sponsorIndex = "sponsorHasSponsor";
    if (!t.companionType) e.companionType = "required";
  } else if (minor) {
    e.sponsorIndex = "minorNeedsSponsor";
  }

  // Documents
  if (!t.passportImage) e.passportImage = "required";
  else if (dataUrlBytes(t.passportImage) > 1024 * 1024) e.passportImage = "max1mb";
  if (!t.personPhoto) e.personPhoto = "required";
  else {
    const size = dataUrlBytes(t.personPhoto);
    if (size > 100 * 1024 || size < 5 * 1024) e.personPhoto = "photoSize";
  }

  // Security questionnaire (MOFA)
  for (const k of SECURITY_CLARIFIED) {
    const a: ClarifiedAnswer = t.security[k];
    if (a.answer !== "true" && a.answer !== "false") e[`security.${k}`] = "answerRequired";
    else if (a.answer === "true" && !a.clarification.trim()) e[`security.${k}`] = "clarificationRequired";
    else if (a.clarification.length > 2000) e[`security.${k}`] = "max2000";
  }
  for (const k of SECURITY_SIMPLE) {
    if (t.security[k] !== "true" && t.security[k] !== "false") e[`security.${k}`] = "answerRequired";
  }

  // Insurance questionnaire
  for (const k of ["question1", "question2", "question3"] as const) {
    if (t.insurance[k] !== "true" && t.insurance[k] !== "false") e[`insurance.${k}`] = "answerRequired";
  }
  if (t.insurance.question4 === "true" || t.insurance.question5 === "true") {
    const m = Number(t.insurance.question6);
    if (!Number.isInteger(m) || m < 1 || m > 9) e["insurance.question6"] = "pregnancyMonths";
  }
  return e;
}

export interface PackageIssues {
  adults: number;
  minors: number;
  errors: ("maxAdults" | "maxMinors" | "maxTravellers")[];
}

export function validatePackageComposition(all: Traveller[], arrivalDate: string): PackageIssues {
  const minors = all.filter((t) => isMinor(t, arrivalDate)).length;
  const adults = all.length - minors;
  const errors: PackageIssues["errors"] = [];
  if (all.length > PACKAGE_LIMITS.maxTravellers) errors.push("maxTravellers");
  if (adults > PACKAGE_LIMITS.maxAdults) errors.push("maxAdults");
  if (minors > PACKAGE_LIMITS.maxMinors) errors.push("maxMinors");
  return { adults, minors, errors };
}

export function emptyTraveller(paxType: Traveller["paxType"], nationality: string): Traveller {
  const qa = () => ({ answer: "" as const, clarification: "" });
  return {
    paxType,
    firstNameEn: "", middleNameEn: "", grandFatherNameEn: "", familyNameEn: "",
    firstNameAr: "", middleNameAr: "", grandFatherNameAr: "", familyNameAr: "",
    birthDate: "", birthplace: nationality, gender: "", job: paxType === "adult" ? "" : "Student",
    nationality, passportNo: "", passportType: "1", passportIssueDate: "", passportExpiryDate: "",
    passportIssuePlace: nationality, religion: "", maritalStatus: paxType === "adult" ? "" : "1",
    email: "", mobileNo: "", zipCode: "", sponsorIndex: paxType === "adult" ? null : 0, companionType: paxType === "adult" ? "" : "SON",
    personPhoto: "", passportImage: "",
    security: {
      moneyLaunderingOffence: qa(), servedJailTime: qa(), servedInMilitary: qa(),
      workedInPoliticsOrMedia: qa(), joinedOrganizationOrParty: qa(),
      beenDeported: "", crimeFromInterpool: "", passportRestricted: "",
    },
    insurance: { question1: "", question2: "", question3: "", question4: "", question5: "", question6: "0" },
  };
}
