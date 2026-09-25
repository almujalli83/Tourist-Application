import QRCode from "qrcode";
import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { canCancelTable, canChangeTable, cancelDeadline, changeDeadline, getTableBooking } from "@/lib/restaurants/bookings";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const booking = await getTableBooking(user.id, (await params).id);
  if (!booking) return error("notFound", 404);
  return json({
    booking,
    qr: await QRCode.toString(booking.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
    canCancel: canCancelTable(booking), canChange: canChangeTable(booking),
    cancelDeadline: cancelDeadline(booking), changeDeadline: changeDeadline(booking),
  });
});
