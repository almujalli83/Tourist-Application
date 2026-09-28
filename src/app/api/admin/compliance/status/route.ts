import { requireAdmin } from "@/lib/auth/admin";
import { verifyAuditLog } from "@/lib/compliance/audit";
import { PRIVACY_VERSION } from "@/lib/compliance/consent";
import { listIncidents } from "@/lib/compliance/incidents";
import { dataFlows } from "@/lib/compliance/residency";
import { lastRetentionRun, retentionRules } from "@/lib/compliance/retention";
import { handle, json } from "@/lib/http";

/** Compliance overview for the back office: residency, retention, audit chain and open incidents. */
export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const incidents = await listIncidents();
  return json({
    privacyVersion: PRIVACY_VERSION,
    flows: dataFlows(),
    retention: { rules: retentionRules().map((r) => ({ key: r.key, days: r.days })), lastRun: await lastRetentionRun() },
    audit: await verifyAuditLog(),
    incidents: { open: incidents.filter((i) => i.status !== "closed").length, overdue: incidents.filter((i) => i.deadline && i.deadline.hoursLeft < 0).length },
  });
});
