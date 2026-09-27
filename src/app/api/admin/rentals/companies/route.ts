import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { listCompanies, saveCompanies } from "@/lib/rentals/companies";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ companies: await listCompanies() });
});

/** Saves the rental companies directory (names, colours, cities, logos, active). */
export const PUT = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const input = await body<{ companies?: unknown }>(req);
  try {
    return json({ companies: await saveCompanies(input?.companies) });
  } catch (e) {
    return error(e instanceof Error ? e.message : "invalidCompany", 400);
  }
});
