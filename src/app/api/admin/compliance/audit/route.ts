import { requireAdmin } from "@/lib/auth/admin";
import { listAudit } from "@/lib/compliance/audit";
import { handle, json } from "@/lib/http";

/** ?actor=&action=&limit= — latest audit entries. */
export const GET = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const q = new URL(req.url).searchParams;
  return json({ entries: await listAudit({ actor: q.get("actor") ?? undefined, action: q.get("action") ?? undefined, limit: Number(q.get("limit")) || 200 }) });
});
