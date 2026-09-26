import { timingSafeEqual } from "node:crypto";
import { error, handle, json } from "@/lib/http";
import { runReminders } from "@/lib/reminders/reminders";

export const maxDuration = 300;

/** Daily reminders job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export const GET = handle(async (req: Request) => {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return error("notConfigured", 503);
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return error("unauthorized", 401);
  return json(await runReminders());
});
