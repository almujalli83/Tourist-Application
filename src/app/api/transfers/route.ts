import { currentUser } from "@/lib/auth/session";
import { body, error, handle, json } from "@/lib/http";
import { listTransfers, requestTransfer, TransferError, type RequestInput } from "@/lib/transfers/transfers";

export const GET = handle(async () => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  return json({ transfers: await listTransfers(user.id) });
});

/** Books the chosen vehicle with the transfer company (paid to the driver). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const input = await body<RequestInput>(req);
  if (!input || typeof input.quoteId !== "string" || typeof input.providerId !== "string") return error("invalidRequest", 400);
  try {
    return json({ transfer: await requestTransfer(user, input) }, 201);
  } catch (e) {
    if (e instanceof TransferError) return error(e.code, e.status);
    throw e;
  }
});
