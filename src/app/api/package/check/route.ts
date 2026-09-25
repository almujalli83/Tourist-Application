import { BookingError, evaluatePackage } from "@/lib/bookings/service";
import { body, error, handle, json } from "@/lib/http";
import type { BookingSelection } from "@/lib/types";

/**
 * Checks the selected (signed) offers against the key package requirements. The booking wizard
 * enables the visa form only when this returns ok; booking creation runs the same check.
 */
export const POST = handle(async (req: Request) => {
  const input = await body<{ selection?: BookingSelection; travellers?: { birthDate?: unknown }[] }>(req);
  if (!input?.selection?.criteria) return error("invalidBody");
  const travellers = Array.isArray(input.travellers)
    ? input.travellers.map((t) => ({ birthDate: typeof t?.birthDate === "string" ? t.birthDate : "" }))
    : undefined;
  try {
    return json({ check: evaluatePackage(input.selection, travellers) });
  } catch (err) {
    if (err instanceof BookingError) return error(err.code, 422, err.details);
    throw err;
  }
});
