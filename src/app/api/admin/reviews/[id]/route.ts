import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { adminModerate, adminReply } from "@/lib/reviews/reviews";

/** Back office: { action: "approve" | "reject", note? } or { action: "reply", text }. */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const { id } = await params;
  const b = await body<{ action?: string; note?: string; text?: string }>(req);
  const r =
    b?.action === "approve" || b?.action === "reject"
      ? await adminModerate(id, b.action, typeof b.note === "string" ? b.note : null)
      : b?.action === "reply" && typeof b.text === "string"
        ? await adminReply(id, b.text)
        : undefined;
  if (r === undefined) return error("invalidBody", 400);
  if (!r) return error("notFound", 404);
  return json({ ok: true });
});
