import { requireAdmin } from "@/lib/auth/admin";
import { AudioError, deleteTour, updateTour, type TourInput } from "@/lib/audio/tours";
import { body, error, handle, json } from "@/lib/http";

const fail = (e: unknown) => {
  if (e instanceof AudioError) return error(e.message, e.message === "notFound" ? 404 : 422);
  throw e;
};

export const PUT = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const b = await body<TourInput>(req);
  if (!b) return error("invalidRequest", 400);
  try {
    return json({ tour: await updateTour((await params).id, b) });
  } catch (e) {
    return fail(e);
  }
});

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  try {
    await deleteTour((await params).id);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
});
