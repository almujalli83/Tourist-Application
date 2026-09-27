import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { BusOrderError, cancelBusOrder, getBusOrder } from "@/lib/buses/orders";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const o = await getBusOrder(user.id, (await params).id);
  if (!o) return error("notFound", 404);
  const qr = await Promise.all(o.tickets.map((t) => QRCode.toString(`${o.pnr}|${t.code}|${t.seat}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" })));
  return json({ order: o, qr });
});

/** Cancels the booking with the operator (refund per the operator's policy). */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  try {
    return json({ order: await cancelBusOrder(user.id, (await params).id) });
  } catch (e) {
    if (e instanceof BusOrderError) return error(e.code, e.status);
    throw e;
  }
});
