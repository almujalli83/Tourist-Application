import { error, handle, json } from "@/lib/http";
import { TransitError, transitLines } from "@/lib/transit/transit";

/** Bus lines with their stops, when the operator publishes them (public). */
export const GET = handle(async (req: Request) => {
  try {
    return json({ lines: await transitLines(new URL(req.url).searchParams.get("city") ?? "RUH") });
  } catch (e) {
    if (e instanceof TransitError) return error(e.code, e.status);
    throw e;
  }
});
