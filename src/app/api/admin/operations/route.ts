import { operationsOverview } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth/admin";
import { handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  return json(await operationsOverview());
});
