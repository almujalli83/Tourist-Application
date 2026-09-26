import type { Traveller } from "@/lib/types";
import type { PassportScan } from "./passport-scanner";

/**
 * Traveller fields read from a passport scan (MRZ, printed issue date, Arabic name). Arabic name
 * parts and the issue date only fill empty fields, so manual corrections are never overwritten.
 */
export function passportPatch({ mrz: r, issueDate, arabicName }: PassportScan, tr: Traveller): Partial<Traveller> {
  const patch: Partial<Traveller> = {};
  const clip = (s: string) => s.slice(0, 15);
  if (r.familyName) patch.familyNameEn = clip(r.familyName);
  if (r.givenNames[0]) patch.firstNameEn = clip(r.givenNames[0]);
  if (r.givenNames[1]) patch.middleNameEn = clip(r.givenNames[1]);
  if (r.givenNames.length > 2) patch.grandFatherNameEn = clip(r.givenNames.slice(2).join(" "));
  if (r.passportNo && r.valid.passportNo) patch.passportNo = r.passportNo;
  if (r.birthDate && r.valid.birthDate) patch.birthDate = r.birthDate;
  if (r.expiryDate && r.valid.expiryDate) patch.passportExpiryDate = r.expiryDate;
  if (r.gender) patch.gender = r.gender;
  if (/^[A-Z]{2}$/.test(r.nationality)) {
    patch.nationality = r.nationality;
    // Country of birth is not in the MRZ; replace it only while it still holds the search default.
    if (!tr.birthplace || tr.birthplace === tr.nationality) patch.birthplace = r.nationality;
  }
  if (issueDate && !tr.passportIssueDate) patch.passportIssueDate = issueDate;
  if (arabicName) {
    for (const k of ["firstNameAr", "middleNameAr", "grandFatherNameAr", "familyNameAr"] as const) {
      if (arabicName[k] && !tr[k]) patch[k] = arabicName[k];
    }
  }
  if (/^[A-Z]{2}$/.test(r.issuingCountry)) patch.passportIssuePlace = r.issuingCountry;
  return patch;
}
