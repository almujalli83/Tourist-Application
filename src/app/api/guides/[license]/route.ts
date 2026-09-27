import { error, handle, json } from "@/lib/http";
import { getGuide } from "@/lib/guides/guides";

export const GET = handle(async (_req: Request, { params }: { params: Promise<{ license: string }> }) => {
  const guide = await getGuide(decodeURIComponent((await params).license));
  return guide ? json({ guide }) : error("notFound", 404);
});
