import { currentUser } from "@/lib/auth/session";
import { error, handle } from "@/lib/http";
import { ticketAttachment } from "@/lib/support/tickets";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ ticket: string; file: string }> }) => {
  const { ticket, file } = await params;
  const f = await ticketAttachment(ticket, file, await currentUser());
  if (!f) return error("notFound", 404);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-disposition": `inline; filename="${encodeURIComponent(f.name)}"`,
    },
  });
});
