import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { gateway } from "@/lib/payments/gateway";

/** Apple Pay merchant validation, through the gateway (only Apple's validation hosts). */
export const POST = handle(async (req: Request) => {
  if (!(await currentUser())) return error("unauthorized", 401);
  const input = await body<{ validationUrl?: string }>(req);
  const url = String(input?.validationUrl ?? "");
  if (!/^https:\/\/apple-pay-gateway(-[a-z0-9-]+)?\.apple\.com\//.test(url)) return error("invalidRequest", 400);
  try {
    return json({ session: await gateway().applePaySession(url, new URL(req.url).hostname) });
  } catch {
    return error("gateway_unavailable", 502);
  }
});
