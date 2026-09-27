import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { activateTicket, getTicket, TransitError } from "@/lib/transit/transit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const t = await getTicket(user.id, (await params).id);
  if (!t) return error("notFound", 404);
  return json({ ticket: t, qrSvg: await QRCode.toString(t.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }) });
});

/** Activates the ticket (its validity starts now). */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ ticket: await activateTicket(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
