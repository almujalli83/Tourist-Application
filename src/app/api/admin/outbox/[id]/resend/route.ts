import { requireAdmin } from "@/lib/auth/admin";
import { error, handle, json } from "@/lib/http";
import { resendOutbox } from "@/lib/notify";

/** Back office: sends a recorded email again. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const msg = await resendOutbox((await params).id);
  return msg ? json({ status: msg.status, error: msg.error }) : error("notFound", 404);
});
