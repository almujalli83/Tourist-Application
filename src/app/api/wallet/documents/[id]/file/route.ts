import { currentUser } from "@/lib/auth/session";
import { error, handle } from "@/lib/http";
import { readWalletFile } from "@/lib/wallet";

/** Streams a decrypted wallet file to its owner (inline, or as a download with ?download=1). */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return error("unauthorized", 401);
  const found = await readWalletFile(user.id, (await params).id);
  if (!found) return error("notFound", 404);
  const ext = found.doc.file!.contentType === "application/pdf" ? "pdf" : found.doc.file!.contentType === "image/png" ? "png" : "jpg";
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(found.data), {
    headers: {
      "content-type": found.doc.file!.contentType,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${found.doc.type}-${found.doc.id.slice(0, 8)}.${ext}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
