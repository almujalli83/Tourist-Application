import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { issuePermit, PermitError, permitQrSvg, type IssueInput } from "@/lib/umrah/permits";

/** Issues a Nusuk permit (Umrah or Rawdah) for the chosen travellers, day and time. */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<IssueInput>(req);
  if (!input || typeof input.tripKey !== "string" || typeof input.slotId !== "string" || typeof input.date !== "string") return error("invalidRequest", 400);
  try {
    const permit = await issuePermit(user.id, input);
    return json({ permit: { ...permit, qrSvg: await permitQrSvg(permit) } }, 201);
  } catch (e) {
    if (e instanceof PermitError) return error(e.code, e.status);
    throw e;
  }
});
