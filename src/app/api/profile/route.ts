import { currentUser } from "@/lib/auth/session";
import { toPublicUser, type CompanyProfile, type IndividualProfile } from "@/lib/auth/types";
import { cleanCompany, cleanIndividual } from "@/lib/auth/validation";
import { transact } from "@/lib/db";
import { body, error, json } from "@/lib/http";

export async function GET() {
  const user = await currentUser();
  return user ? json({ user }) : error("unauthorized", 401);
}

export async function PUT(req: Request) {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<{ individual?: Partial<IndividualProfile>; company?: Partial<CompanyProfile> }>(req);
  const individual = user.accountType === "individual" ? cleanIndividual(b?.individual) : null;
  const company = user.accountType === "company" ? cleanCompany(b?.company) : null;
  if (!individual && !company) return error("required");
  const updated = await transact((db) => {
    const u = db.users.find((x) => x.id === user.id)!;
    if (individual) u.individual = individual;
    if (company) u.company = company;
    return u;
  });
  return json({ user: toPublicUser(updated) });
}
