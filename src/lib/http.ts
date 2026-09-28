import { NextResponse } from "next/server";
import { ensureSecrets } from "./secrets";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function error(code: string, status = 400, details?: unknown) {
  return json({ error: code, details }, status);
}

export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Wraps a route handler so configuration errors return a clear, logged error code. Sensitive
 * requests (back office, ministry, account changes) are also written to the audit log.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await ensureSecrets();
      const req = args[0] instanceof Request ? args[0] : null;
      const path = req ? new URL(req.url).pathname : "";
      if (!req) return await fn(...args);
      const ra = await import("./compliance/request-audit");
      if (!ra.auditedRequest(req.method, path)) return await fn(...args);
      const actor = await ra.actorOf(req);
      const res = await fn(...args);
      await ra.auditRequest(req, actor, res.status);
      return res;
    } catch (err) {
      console.error(err);
      const config = err instanceof Error && err.name === "ServerConfigError";
      return error(config ? "serverConfig" : "generic", 500);
    }
  };
}
