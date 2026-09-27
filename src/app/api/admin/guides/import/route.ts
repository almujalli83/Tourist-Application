import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { expireGuideRequests } from "@/lib/guides/bookings";
import { importGuides, parseGuidesCsv } from "@/lib/guides/guides";

/** Imports the MoT guides list (CSV text or JSON rows); expired licences are skipped. */
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const input = await body<{ csv?: string; rows?: Record<string, unknown>[]; full?: boolean }>(req);
  const rows = typeof input?.csv === "string" ? parseGuidesCsv(input.csv) : Array.isArray(input?.rows) ? input.rows : null;
  if (!rows || rows.length > 20_000) return error("invalidRequest", 400);
  const result = await importGuides(rows, "import", { full: !!input?.full });
  await expireGuideRequests();
  return json({ result });
});
