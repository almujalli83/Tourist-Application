import { currentUser } from "@/lib/auth/session";
import { error, handle, json } from "@/lib/http";
import { uploadWalletDocument, WalletError } from "@/lib/wallet";

/** Uploads a document (multipart: file, personKey, type, title?, number?, issueDate?, expiryDate?). */
export const POST = handle(async (req: Request) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return error("invalidBody");
  const str = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : undefined);
  try {
    const doc = await uploadWalletDocument(user.id, {
      personKey: str("personKey") ?? "",
      type: str("type") ?? "",
      title: str("title"),
      data: Buffer.from(await file.arrayBuffer()),
      meta: { number: str("number"), issueDate: str("issueDate"), expiryDate: str("expiryDate") },
    });
    return json({ document: doc }, 201);
  } catch (err) {
    if (err instanceof WalletError) return error(err.message, 422);
    throw err;
  }
});
