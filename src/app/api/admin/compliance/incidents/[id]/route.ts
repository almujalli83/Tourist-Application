import { requireAdmin } from "@/lib/auth/admin";
import { IncidentError, updateIncident } from "@/lib/compliance/incidents";
import { body, error, handle, json } from "@/lib/http";

/** { status?, authorityNotified?, usersNotified?, personalData?, affected?, note? } */
export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const { id } = await ctx.params;
  try {
    const i = await updateIncident(id, (await body<Record<string, unknown>>(req)) ?? {}, a.user.email);
    return i ? json({ incident: i }) : error("notFound", 404);
  } catch (e) {
    if (e instanceof IncidentError) return error(e.message, 422);
    throw e;
  }
});
