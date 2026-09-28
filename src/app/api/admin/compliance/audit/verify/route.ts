import { requireAdmin } from "@/lib/auth/admin";
import { verifyAuditLog } from "@/lib/compliance/audit";
import { handle, json } from "@/lib/http";

/** Checks the audit log's signatures and chain. */
export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json(await verifyAuditLog());
});
