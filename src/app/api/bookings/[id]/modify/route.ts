import { currentUser } from "@/lib/auth/session";
import { executeModification, type ModificationPlan } from "@/lib/bookings/modify";
import { BookingError } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";
import type { CardInput } from "@/lib/payment";

export const maxDuration = 60;

/** Applies a modification: payment / refund, agent changes, MT update and notification. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ plan?: ModificationPlan; expectedChargeSAR?: number; expectedRefundSAR?: number; card?: CardInput }>(req);
  if (!input?.plan?.newReturnDate || typeof input.expectedChargeSAR !== "number" || typeof input.expectedRefundSAR !== "number")
    return error("invalidBody");
  try {
    const { modification } = await executeModification(user, (await params).id, {
      plan: input.plan,
      expectedChargeSAR: input.expectedChargeSAR,
      expectedRefundSAR: input.expectedRefundSAR,
      card: input.card,
    });
    return json({ modification }, 201);
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    throw err;
  }
});
