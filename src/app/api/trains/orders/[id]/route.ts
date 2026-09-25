import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { cancelDeadline, canCancelTrain, getTrainOrder, refundQuote } from "@/lib/trains/orders";

type Ctx = { params: Promise<{ id: string }> };

/** The order with a QR code (SVG) per ticket and the refund if cancelled now. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const order = await getTrainOrder(user.id, (await params).id);
  if (!order) return error("notFound", 404);
  const qr: Record<string, string> = {};
  for (const t of order.tickets) qr[t.id] = await QRCode.toString(t.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const canCancel = canCancelTrain(order);
  return json({ order, qr, canCancel, deadline: cancelDeadline(order), refund: canCancel ? refundQuote(order) : null });
});
