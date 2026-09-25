import { currentUser } from "@/lib/auth/session";
import { error, handle } from "@/lib/http";
import { getSavedTraveller } from "@/lib/saved-travellers-repo";

/** Passport image or personal photo kept with a saved traveller (shown in the wallet). */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ travellerId: string; kind: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const { travellerId, kind } = await params;
  if (kind !== "passportImage" && kind !== "personPhoto") return error("notFound", 404);
  const t = await getSavedTraveller(user.id, travellerId);
  const dataUrl = t?.[kind];
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return error("notFound", 404);
  return new Response(new Uint8Array(Buffer.from(m[2], "base64")), {
    headers: { "content-type": m[1], "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
});
