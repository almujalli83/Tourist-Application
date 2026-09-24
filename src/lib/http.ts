import { NextResponse } from "next/server";

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

/** Wraps a route handler so configuration errors return a clear, logged error code. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(err);
      const config = err instanceof Error && err.name === "ServerConfigError";
      return error(config ? "serverConfig" : "generic", 500);
    }
  };
}
