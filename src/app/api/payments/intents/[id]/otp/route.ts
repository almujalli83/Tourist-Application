import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { PayError, submitOtp } from "@/lib/payments/intents";

/** STC Pay: the one-time code. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<{ otp?: string }>(req);
  try {
    return json({ intent: await submitOtp(user.id, (await params).id, String(input?.otp ?? "")) });
  } catch (e) {
    if (e instanceof PayError) return error(e.code, e.status);
    throw e;
  }
});
