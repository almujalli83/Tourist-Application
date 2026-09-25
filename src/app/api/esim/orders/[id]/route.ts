import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { canCancelEsim, getEsimOrder } from "@/lib/esim/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** The order with the installation QR code (SVG) of each eSIM. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const order = await getEsimOrder(user.id, (await params).id);
  if (!order) return error("notFound", 404);
  const qr: Record<string, string> = {};
  for (const l of order.lines) qr[l.id] = await QRCode.toString(l.activationCode, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return json({ order, qr, canCancel: await canCancelEsim(order) });
});
