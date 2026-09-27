import { handle, json } from "@/lib/http";
import { transitOperators } from "@/lib/transit/transit";

/** Cities with public transport in the platform and what each offers (public). */
export const GET = handle(async () => json({ operators: transitOperators() }));
