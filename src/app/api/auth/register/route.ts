import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { toPublicUser, type CompanyProfile, type IndividualProfile, type StoredUser } from "@/lib/auth/types";
import { cleanCompany, cleanIndividual, EMAIL_RE } from "@/lib/auth/validation";
import { transact } from "@/lib/db";
import { body, error, json } from "@/lib/http";

interface RegisterBody {
  email: string;
  password: string;
  accountType: "individual" | "company";
  individual?: Partial<IndividualProfile>;
  company?: Partial<CompanyProfile>;
  locale?: "ar" | "en";
}

export async function POST(req: Request) {
  const b = await body<RegisterBody>(req);
  if (!b) return error("invalidBody");
  const email = b.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) return error("email");
  if ((b.password ?? "").length < 8) return error("weakPassword");
  if (b.accountType !== "individual" && b.accountType !== "company") return error("required");
  const individual = b.accountType === "individual" ? cleanIndividual(b.individual) : null;
  const company = b.accountType === "company" ? cleanCompany(b.company) : null;
  if (!individual && !company) return error("required");

  const passwordHash = await hashPassword(b.password);
  const user = await transact((db) => {
    if (db.users.some((u) => u.email === email)) return null;
    const u: StoredUser = {
      id: randomUUID(),
      email,
      passwordHash,
      accountType: b.accountType,
      ...(individual ? { individual } : {}),
      ...(company ? { company } : {}),
      preferredLocale: b.locale === "en" ? "en" : "ar",
      preferredCurrency: "SAR",
      createdAt: new Date().toISOString(),
    };
    db.users.push(u);
    return u;
  });
  if (!user) return error("exists", 409);
  await setSessionCookie(user.id);
  return json({ user: toPublicUser(user) }, 201);
}
