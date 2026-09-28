/**
 * Security audit log (NCA ECC: event logs; PDPL: accountability). Each entry is chained to the
 * previous one with an HMAC, so a removed or altered entry is detected by verifyAuditLog().
 * Entries carry the request path and outcome only — never request bodies, tokens or passwords.
 */
import { createHmac } from "node:crypto";
import { secretFor } from "../secrets";
import { store } from "../store";

export type AuditRole = "admin" | "ministry" | "user" | "token" | "anonymous" | "system";

export interface AuditInput {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  role: AuditRole;
  /** What was acted on (a path, a user id, a booking reference…). */
  target?: string | null;
  status?: number | null;
  ip?: string | null;
  device?: string | null;
}

export interface AuditEntry extends Required<AuditInput> {
  id: string;
  seq: number;
  at: string;
  prev: string;
  hash: string;
}

interface Head { id: string; seq: number; hash: string }

const HEAD = "auditHead";
const GENESIS = "genesis";
export const idOfSeq = (seq: number) => String(seq).padStart(12, "0");

function sign(e: Omit<AuditEntry, "hash">): string {
  const body = [e.seq, e.at, e.prev, e.action, e.role, e.actorId, e.actorEmail, e.target, e.status, e.ip, e.device].map((v) => (v === null ? "" : String(v))).join("\u001f");
  return createHmac("sha256", secretFor("audit")).update(body).digest("base64url");
}

/** Records an event. Never throws: an audit failure must not break the request it describes. */
export async function audit(input: AuditInput, now = new Date()): Promise<AuditEntry | null> {
  try {
    const s = store();
    await s.insert<Head>("config", HEAD, { id: HEAD, seq: 0, hash: GENESIS });
    let entry: AuditEntry | null = null;
    await s.update<Head>("config", HEAD, (h) => {
      const base = {
        id: idOfSeq(h.seq + 1), seq: h.seq + 1, at: now.toISOString(), prev: h.hash,
        action: input.action.slice(0, 120), role: input.role,
        actorId: input.actorId ?? null, actorEmail: input.actorEmail ?? null,
        target: input.target?.slice(0, 200) ?? null, status: input.status ?? null,
        ip: input.ip?.slice(0, 64) ?? null, device: input.device?.slice(0, 80) ?? null,
      };
      entry = { ...base, hash: sign(base) };
      return { id: HEAD, seq: base.seq, hash: entry.hash };
    });
    if (entry) await s.put("auditLog", (entry as AuditEntry).id, entry);
    return entry;
  } catch (err) {
    console.error("audit log write failed", err);
    return null;
  }
}

export interface AuditQuery { actor?: string; action?: string; limit?: number }

/** Latest entries first. */
export async function listAudit(q: AuditQuery = {}): Promise<AuditEntry[]> {
  const all = (await store().entries<AuditEntry>("auditLog")).map((e) => e.doc);
  const actor = q.actor?.trim().toLowerCase();
  const action = q.action?.trim().toLowerCase();
  return all
    .filter((e) => (!actor || e.actorEmail?.toLowerCase().includes(actor) || e.actorId === actor || e.ip === actor) && (!action || e.action.toLowerCase().includes(action)))
    .sort((a, b) => b.seq - a.seq)
    .slice(0, Math.min(Math.max(q.limit ?? 200, 1), 1000));
}

/** A user's own security events (for their data copy). */
export async function auditOfUser(userId: string, limit = 200): Promise<AuditEntry[]> {
  return (await store().findBy<AuditEntry>("auditLog", "actorId", userId)).sort((a, b) => b.seq - a.seq).slice(0, limit);
}

export interface AuditVerification {
  ok: boolean;
  count: number;
  firstSeq: number | null;
  lastSeq: number | null;
  /** Entries whose signature does not match their content. */
  altered: number[];
  /** Sequence numbers missing between the first kept entry and the head. */
  missing: number[];
  /** The head points past the last stored entry. */
  headMismatch: boolean;
}

/**
 * Checks every kept entry's signature and the chain between consecutive entries. The oldest kept
 * entry may point to one removed by the retention policy; everything after it must be intact.
 */
export async function verifyAuditLog(): Promise<AuditVerification> {
  const s = store();
  const entries = (await s.entries<AuditEntry>("auditLog")).map((e) => e.doc).sort((a, b) => a.seq - b.seq);
  const head = await s.get<Head>("config", HEAD);
  const altered: number[] = [];
  const missing: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const { hash, ...rest } = e;
    if (sign(rest) !== hash) altered.push(e.seq);
    const before = entries[i - 1];
    if (before) {
      for (let n = before.seq + 1; n < e.seq && missing.length < 100; n++) missing.push(n);
      if (before.seq === e.seq - 1 && e.prev !== before.hash) altered.push(e.seq);
    }
  }
  const last = entries[entries.length - 1];
  const headMismatch = !!head && head.seq > 0 && (!last || last.seq !== head.seq || last.hash !== head.hash);
  return {
    ok: altered.length === 0 && missing.length === 0 && !headMismatch,
    count: entries.length, firstSeq: entries[0]?.seq ?? null, lastSeq: last?.seq ?? null,
    altered: [...new Set(altered)], missing, headMismatch,
  };
}
