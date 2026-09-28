import { requireAdmin } from "@/lib/auth/admin";
import { createIncident, IncidentError, listIncidents } from "@/lib/compliance/incidents";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ incidents: await listIncidents() });
});

/** { title, description, severity, personalData, affected?, detectedAt? } */
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  try {
    return json({ incident: await createIncident((await body<Record<string, unknown>>(req)) ?? {}, a.user.email) }, 201);
  } catch (e) {
    if (e instanceof IncidentError) return error(e.message, 422);
    throw e;
  }
});
