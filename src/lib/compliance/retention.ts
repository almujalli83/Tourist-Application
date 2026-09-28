/**
 * Data retention (PDPL: personal data is kept only as long as needed). A daily job deletes records
 * past their period; the periods are also shown in the privacy policy. Bookings, payments and
 * invoices are not deleted here: they are financial records kept as the law requires (and are
 * stripped of the profile when an account is deleted).
 */
import { store } from "../store";
import type { Collection } from "../store/types";

export interface RetentionRule {
  key: string;
  collection: Collection;
  days: number;
  /** When the record's period starts (ISO date), or null to keep it. */
  since: (doc: Record<string, unknown>, id: string) => string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const latest = (...v: unknown[]) => v.map(str).filter((x): x is string => !!x).sort().pop() ?? null;

/** Audit logs are kept at least 12 months (NCA ECC); AUDIT_RETENTION_DAYS may raise it. */
export const auditRetentionDays = () => Math.max(365, Number(process.env.AUDIT_RETENTION_DAYS) || 730);

export function retentionRules(): RetentionRule[] {
  return [
    { key: "sessions", collection: "sessions", days: 30, since: (d) => latest(d.revokedAt, d.expiresAt) },
    { key: "authTokens", collection: "authTokens", days: 7, since: (d) => latest(d.usedAt, d.expiresAt) },
    { key: "authThrottle", collection: "authThrottle", days: 2, since: (d) => str(d.windowStart) },
    { key: "chats", collection: "chats", days: 30, since: (d) => str(d.updatedAt) },
    { key: "aiUsage", collection: "aiUsage", days: 30, since: (_d, id) => (/^\d{4}-\d{2}-\d{2}/.test(id) ? id.slice(0, 10) : null) },
    { key: "outbox", collection: "outbox", days: 180, since: (d) => str(d.createdAt) },
    { key: "notifications", collection: "notifications", days: 365, since: (d) => str(d.createdAt) },
    { key: "tripShares", collection: "tripShares", days: 30, since: (d) => latest(d.revokedAt, d.expiresAt) },
    { key: "auditLog", collection: "auditLog", days: auditRetentionDays(), since: (d) => str(d.at) },
  ];
}

export interface RetentionRun { at: string; deleted: Record<string, number>; total: number }

const LAST_RUN = "retentionLastRun";

export async function runRetention(now = new Date()): Promise<RetentionRun> {
  const s = store();
  const deleted: Record<string, number> = {};
  for (const r of retentionRules()) {
    const cutoff = now.getTime() - r.days * 86_400_000;
    let n = 0;
    for (const { id, doc } of await s.entries<Record<string, unknown>>(r.collection)) {
      const since = r.since(doc ?? {}, id);
      const t = since ? Date.parse(since) : NaN;
      if (Number.isFinite(t) && t < cutoff && (await s.delete(r.collection, id))) n++;
    }
    deleted[r.key] = n;
  }
  const run: RetentionRun = { at: now.toISOString(), deleted, total: Object.values(deleted).reduce((a, b) => a + b, 0) };
  await s.put("config", LAST_RUN, { id: LAST_RUN, ...run });
  return run;
}

export async function lastRetentionRun(): Promise<RetentionRun | null> {
  const r = await store().get<RetentionRun & { id: string }>("config", LAST_RUN);
  if (!r) return null;
  return { at: r.at, deleted: r.deleted, total: r.total };
}
