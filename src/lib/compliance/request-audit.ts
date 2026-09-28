/**
 * Which API requests are audited automatically (by handle()): every back-office and ministry
 * request, every change to an account (plus the data copy), and every tourist eVisa application. The actor is read before the
 * handler runs, so an account deletion is still attributed to its owner.
 */
import { currentSession } from "../auth/session";
import { describeDevice } from "../auth/sessions";
import { clientIp } from "../auth/throttle";
import { audit, type AuditRole } from "./audit";

export function auditedRequest(method: string, path: string): boolean {
  if (path.startsWith("/api/admin/") || path === "/api/indicators") return true;
  if (path.startsWith("/api/account/")) return method !== "GET" || path === "/api/account/export";
  if (path.startsWith("/api/auth/password/") || path === "/api/auth/logout") return method !== "GET";
  if (path.startsWith("/api/family") || path.startsWith("/api/travellers")) return method !== "GET";
  // Tourist eVisa applications carry passport data, photos and questionnaires.
  if (path === "/api/evisa") return method === "POST";
  return false;
}

export interface Actor { actorId: string | null; actorEmail: string | null; role: AuditRole }

export async function actorOf(req: Request): Promise<Actor> {
  try {
    const s = await currentSession();
    if (s) return { actorId: s.user.id, actorEmail: s.user.email, role: s.user.isAdmin ? "admin" : s.user.isMinistry ? "ministry" : "user" };
  } catch {
    // no request scope (e.g. unit tests): fall through
  }
  if (/^Bearer\s/i.test(req.headers.get("authorization") ?? "")) return { actorId: null, actorEmail: null, role: "token" };
  return { actorId: null, actorEmail: null, role: "anonymous" };
}

export async function auditRequest(req: Request, actor: Actor, status: number): Promise<void> {
  const url = new URL(req.url);
  await audit({
    action: `${req.method} ${url.pathname}`,
    ...actor,
    status,
    ip: clientIp(req),
    device: describeDevice(req.headers.get("user-agent") ?? ""),
  });
}
