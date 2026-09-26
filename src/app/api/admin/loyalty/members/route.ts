import { requireAdmin } from "@/lib/auth/admin";
import { error, handle, json } from "@/lib/http";
import { memberDetails } from "@/lib/loyalty/loyalty";

/** Back office: a member's points and full history (?email=). */
export const GET = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const email = new URL(req.url).searchParams.get("email")?.trim();
  if (!email) return error("invalidRequest", 400);
  const member = await memberDetails(email);
  return member ? json(member) : error("memberNotFound", 404);
});
