import { currentUser } from "@/lib/auth/session";
import { error, handle } from "@/lib/http";
import { reviewPhoto } from "@/lib/reviews/reviews";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string; photo: string }> }) => {
  const { id, photo } = await params;
  const file = await reviewPhoto(id, photo, await currentUser());
  if (!file) return error("notFound", 404);
  return new Response(new Uint8Array(file.data), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
});
