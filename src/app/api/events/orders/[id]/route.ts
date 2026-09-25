import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { canCancel, cancellationDeadline, getOrder } from "@/lib/events/orders";
import { error, handle, json } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** The order with a QR code (SVG) per ticket. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const order = await getOrder(user.id, (await params).id);
  if (!order) return error("notFound", 404);
  const qr: Record<string, string> = {};
  for (const t of order.tickets) qr[t.id] = await QRCode.toString(t.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return json({ order, qr, canCancel: canCancel(order), deadline: cancellationDeadline(order) });
});
