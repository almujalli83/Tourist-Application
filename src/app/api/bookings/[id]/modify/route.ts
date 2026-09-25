import { currentUser } from "@/lib/auth/session";
import { executeModification, type ModificationPlan } from "@/lib/bookings/modify";
import { BookingError } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";
import type { CardInput } from "@/lib/payment";

export const maxDuration = 60;

/** Applies a modification: agents' approval, payment / refund, MT update and notification. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{
    plan?: ModificationPlan; expectedChargeSAR?: number; expectedRefundSAR?: number; bookingVersion?: number; idempotencyKey?: string; card?: CardInput;
  }>(req);
  if (
    !input?.plan?.newReturnDate || typeof input.expectedChargeSAR !== "number" || typeof input.expectedRefundSAR !== "number" ||
    typeof input.bookingVersion !== "number" || typeof input.idempotencyKey !== "string"
  )
    return error("invalidBody");
  try {
    const { modification, replayed } = await executeModification(user, (await params).id, {
      plan: input.plan,
      expectedChargeSAR: input.expectedChargeSAR,
      expectedRefundSAR: input.expectedRefundSAR,
      bookingVersion: input.bookingVersion,
      idempotencyKey: input.idempotencyKey,
      card: input.card,
    });
    return json({ modification, replayed }, replayed ? 200 : 201);
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, err.code === "inProgress" || err.code === "bookingChanged" ? 409 : 422, err.details);
    throw err;
  }
});
