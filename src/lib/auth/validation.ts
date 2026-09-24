import type { CompanyProfile, IndividualProfile } from "./types";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanIndividual(p: Partial<IndividualProfile> | undefined): IndividualProfile | null {
  const v = { fullName: p?.fullName?.trim() ?? "", phone: p?.phone?.trim() ?? "", nationality: p?.nationality?.trim() ?? "" };
  return v.fullName && v.phone ? v : null;
}

export function cleanCompany(p: Partial<CompanyProfile> | undefined): CompanyProfile | null {
  const v: CompanyProfile = {
    companyName: p?.companyName?.trim() ?? "",
    commercialRegNo: p?.commercialRegNo?.trim() ?? "",
    tourismLicenseNo: p?.tourismLicenseNo?.trim() ?? "",
    vatNo: p?.vatNo?.trim() ?? "",
    contactPerson: p?.contactPerson?.trim() ?? "",
    phone: p?.phone?.trim() ?? "",
    city: p?.city?.trim() ?? "",
  };
  return v.companyName && v.commercialRegNo && v.tourismLicenseNo && v.contactPerson && v.phone ? v : null;
}
