import { handle, json } from "@/lib/http";
import { payConfig } from "@/lib/payments/gateway";

/** Public checkout settings: gateway, tokenizer and wallet availability. */
export const GET = handle(async () => json(payConfig()));
