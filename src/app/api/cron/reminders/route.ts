import { cronDenied } from "@/lib/cron";
import { handle, json } from "@/lib/http";
import { runReminders } from "@/lib/reminders/reminders";

export const maxDuration = 300;

/** Daily reminders job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`). */
export const GET = handle(async (req: Request) => {
  const denied = cronDenied(req);
  if (denied) return denied;
  return json(await runReminders());
});
