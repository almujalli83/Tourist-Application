import { requireAdmin } from "@/lib/auth/admin";
import { AudioError, getTour, translateTour } from "@/lib/audio/tours";
import { error, handle, json } from "@/lib/http";

export const maxDuration = 120;

/** Machine-translates the missing languages (marked for the team's review). */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const id = (await params).id;
  try {
    const r = await translateTour(id);
    return json({ ...r, tour: await getTour(id) });
  } catch (e) {
    if (e instanceof AudioError) return error(e.message, e.message === "notFound" ? 404 : 422);
    throw e;
  }
});
