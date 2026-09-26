import { requireAdmin } from "@/lib/auth/admin";
import { body, error, handle, json } from "@/lib/http";
import { adminAdjust, LoyaltyError } from "@/lib/loyalty/loyalty";

/** Back office: { email, points (+ credit / − debit), note } — recorded with who made it. */
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const b = await body<{ email?: string; points?: number; note?: string }>(req);
  if (typeof b?.email !== "string" || typeof b.note !== "string") return error("invalidRequest", 400);
  try {
    return json(await adminAdjust(a.user, b.email, Number(b.points), b.note));
  } catch (e) {
    if (e instanceof LoyaltyError) return error(e.code, e.status);
    throw e;
  }
});
