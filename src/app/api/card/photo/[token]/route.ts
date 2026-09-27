import { error, handle } from "@/lib/http";
import { verifyCardToken } from "@/lib/card/card";
import { personPhoto } from "@/lib/wallet";

/** The card holder's photo, for a valid scanned code only (shown on the check page). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  // The check page may stay open a few minutes after scanning.
  const v = await verifyCardToken(token, new Date(Date.now() - 10 * 60_000));
  if (!("card" in v) || !v.photo || !v.userId || !v.personKey) return error("notFound", 404);
  const photo = await personPhoto(v.userId, v.personKey);
  if (!photo) return error("notFound", 404);
  return new Response(new Uint8Array(photo.data), { headers: { "content-type": photo.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
});
