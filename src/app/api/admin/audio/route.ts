import { aiConfigured } from "@/lib/assistant/claude";
import { requireAdmin } from "@/lib/auth/admin";
import { AudioError, adminTours, createTour, type TourInput } from "@/lib/audio/tours";
import { ttsConfigured } from "@/lib/audio/tts";
import { body, error, handle, json } from "@/lib/http";

export const GET = handle(async () => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  return json({ tours: await adminTours(), tts: ttsConfigured(), ai: aiConfigured() });
});

/** New tour (a draft). */
export const POST = handle(async (req: Request) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const b = await body<TourInput>(req);
  if (!b) return error("invalidRequest", 400);
  try {
    return json({ tour: await createTour(b) }, 201);
  } catch (e) {
    if (e instanceof AudioError) return error(e.message, 422);
    throw e;
  }
});
