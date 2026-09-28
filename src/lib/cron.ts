import { timingSafeEqual } from "node:crypto";
import { error } from "./http";

/** Scheduled jobs send `Authorization: Bearer $CRON_SECRET` (Vercel Cron, or a system cron in self-hosting). */
export function cronDenied(req: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return error("notConfigured", 503);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return error("unauthorized", 401);
  return null;
}
