/**
 * Personal data incident register (PDPL implementing regulation: the competent authority — SDAIA —
 * is notified within 72 hours of becoming aware of an incident that affects personal data, and
 * affected people are told without undue delay when it may harm them).
 */
import { randomUUID } from "node:crypto";
import { store } from "../store";

export const NOTIFY_HOURS = 72;
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const STATUSES = ["open", "contained", "closed"] as const;
export type Severity = (typeof SEVERITIES)[number];
export type IncidentStatus = (typeof STATUSES)[number];

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  personalData: boolean;
  affected: number | null;
  detectedAt: string;
  createdAt: string;
  createdBy: string;
  authorityNotifiedAt: string | null;
  usersNotifiedAt: string | null;
  closedAt: string | null;
  notes: { at: string; by: string; text: string }[];
}

export class IncidentError extends Error {}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isoOrNull = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);

/** The time left to notify the authority (negative when overdue), or null when not required/done. */
export function authorityDeadline(i: Pick<Incident, "personalData" | "detectedAt" | "authorityNotifiedAt">): { due: string; hoursLeft: number } | null {
  if (!i.personalData || i.authorityNotifiedAt) return null;
  const due = Date.parse(i.detectedAt) + NOTIFY_HOURS * 3_600_000;
  return { due: new Date(due).toISOString(), hoursLeft: Math.floor((due - Date.now()) / 3_600_000) };
}

export async function createIncident(input: Record<string, unknown>, by: string, now = new Date()): Promise<Incident> {
  const title = text(input.title, 160);
  if (!title) throw new IncidentError("title");
  const severity = SEVERITIES.includes(input.severity as Severity) ? (input.severity as Severity) : null;
  if (!severity) throw new IncidentError("severity");
  const detectedAt = isoOrNull(input.detectedAt) ?? now.toISOString();
  if (Date.parse(detectedAt) > now.getTime() + 60_000) throw new IncidentError("detectedAt");
  const affected = Number.isInteger(input.affected) && (input.affected as number) >= 0 ? (input.affected as number) : null;
  const i: Incident = {
    id: randomUUID(), title, description: text(input.description, 4000), severity, status: "open",
    personalData: input.personalData === true, affected, detectedAt, createdAt: now.toISOString(), createdBy: by,
    authorityNotifiedAt: null, usersNotifiedAt: null, closedAt: null, notes: [],
  };
  await store().put("incidents", i.id, i);
  return i;
}

export async function updateIncident(id: string, input: Record<string, unknown>, by: string, now = new Date()): Promise<Incident | null> {
  if (input.status !== undefined && !STATUSES.includes(input.status as IncidentStatus)) throw new IncidentError("status");
  return store().update<Incident>("incidents", id, (i) => {
    const next: Incident = { ...i };
    if (input.status !== undefined) {
      next.status = input.status as IncidentStatus;
      next.closedAt = next.status === "closed" ? i.closedAt ?? now.toISOString() : null;
    }
    if (input.authorityNotified === true && !i.authorityNotifiedAt) next.authorityNotifiedAt = now.toISOString();
    if (input.usersNotified === true && !i.usersNotifiedAt) next.usersNotifiedAt = now.toISOString();
    if (typeof input.personalData === "boolean") next.personalData = input.personalData;
    if (Number.isInteger(input.affected) && (input.affected as number) >= 0) next.affected = input.affected as number;
    const note = text(input.note, 2000);
    if (note) next.notes = [...i.notes, { at: now.toISOString(), by, text: note }].slice(-100);
    return next;
  });
}

export async function listIncidents(): Promise<(Incident & { deadline: ReturnType<typeof authorityDeadline> })[]> {
  const all = (await store().entries<Incident>("incidents")).map((e) => e.doc);
  return all.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).map((i) => ({ ...i, deadline: authorityDeadline(i) }));
}
