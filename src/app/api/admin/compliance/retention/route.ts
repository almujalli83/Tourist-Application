import { requireAdmin } from "@/lib/auth/admin";
import { runRetention } from "@/lib/compliance/retention";
import { handle, json } from "@/lib/http";

/** Runs the retention job now (it also runs daily). */
export const POST = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json(await runRetention());
});
