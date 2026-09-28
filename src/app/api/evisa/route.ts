import { currentUser } from "@/lib/auth/session";
import { evisaCountries } from "@/lib/evisa/eligibility";
import { applyForEvisa, EvisaError, evisaFeeSAR, listEvisaApplications, type EvisaInput } from "@/lib/evisa/service";
import { body, error, handle, json } from "@/lib/http";

/** The traveller's applications, with the fee and the eligible nationalities. */
export const GET = handle(async () => {
  const user = await currentUser();
  const info = { feeSAR: evisaFeeSAR(), countries: evisaCountries() };
  if (!user) return json({ ...info, applications: [] });
  return json({ ...info, applications: await listEvisaApplications(user.id) });
});

/** Pays the fees and submits each traveller's tourist eVisa application. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const b = await body<EvisaInput>(req);
  if (!b) return error("invalidBody");
  try {
    return json({ application: await applyForEvisa(user, b) }, 201);
  } catch (e) {
    if (e instanceof EvisaError) return error(e.code, e.status, e.details);
    throw e;
  }
});
