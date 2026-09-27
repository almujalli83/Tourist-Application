import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { afterRegister, passwordProblem } from "@/lib/auth/account";
import type { CompanyProfile, IndividualProfile } from "@/lib/auth/types";
import { cleanCompany, cleanIndividual, EMAIL_RE } from "@/lib/auth/validation";
import { ensureAccount, isEligible, joinWithReferral } from "@/lib/loyalty/loyalty";
import { createUser } from "@/lib/repo";
import { body, error, handle, json } from "@/lib/http";
import { validatePhone } from "@/lib/phone";

interface RegisterBody {
  email: string;
  password: string;
  accountType: "individual" | "company";
  individual?: Partial<IndividualProfile>;
  company?: Partial<CompanyProfile>;
  locale?: "ar" | "en";
  /** Referral code of the member who invited them (loyalty programme). */
  referralCode?: string;
}

export const POST = handle(async (req: Request) => {
  const b = await body<RegisterBody>(req);
  if (!b) return error("invalidBody");
  const email = b.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return error("email");
  const weak = passwordProblem(b.password, email);
  if (weak) return error(weak);
  if (b.accountType !== "individual" && b.accountType !== "company") return error("required");
  const phone = b.accountType === "company" ? b.company?.phone : b.individual?.phone;
  if (validatePhone(phone?.trim() ?? "")) return error("phone");
  const individual = b.accountType === "individual" ? cleanIndividual(b.individual) : null;
  const company = b.accountType === "company" ? cleanCompany(b.company) : null;
  if (!individual && !company) return error("required");

  const passwordHash = await hashPassword(b.password);
  const user = await createUser({
    id: randomUUID(),
    email,
    passwordHash,
    hasPassword: true,
    accountType: b.accountType,
    ...(individual ? { individual } : {}),
    ...(company ? { company } : {}),
    preferredLocale: b.locale === "en" ? "en" : "ar",
    preferredCurrency: "SAR",
    createdAt: new Date().toISOString(),
  });
  if (!user) return error("exists", 409);
  // Individual accounts join the loyalty programme automatically.
  if (isEligible(user)) {
    await ensureAccount(user.id);
    if (typeof b.referralCode === "string") await joinWithReferral(user, b.referralCode);
  }
  return json({ user: await afterRegister(user, b.locale === "en" ? "en" : "ar", req) }, 201);
});
