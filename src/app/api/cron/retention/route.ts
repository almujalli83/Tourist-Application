import { audit } from "@/lib/compliance/audit";
import { runRetention } from "@/lib/compliance/retention";
import { cronDenied } from "@/lib/cron";
import { handle, json } from "@/lib/http";

export const maxDuration = 300;

/** Daily data-retention job: deletes records past their retention period. */
export const GET = handle(async (req: Request) => {
  const denied = cronDenied(req);
  if (denied) return denied;
  const run = await runRetention();
  await audit({ action: "retention.run", role: "system", target: `deleted ${run.total}`, status: 200 });
  return json(run);
});
