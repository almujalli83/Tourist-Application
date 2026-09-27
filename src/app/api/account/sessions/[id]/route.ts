import { signedIn } from "@/lib/auth/respond";
import { revokeSession } from "@/lib/auth/sessions";
import { error, handle, json } from "@/lib/http";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const s = await signedIn();
  if (s instanceof Response) return s;
  return (await revokeSession(s.userId, (await params).id)) ? json({ ok: true }) : error("notFound", 404);
});
