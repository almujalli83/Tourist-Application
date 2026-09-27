import { currentUser } from "@/lib/auth/session";
import { tourView } from "@/lib/audio/tours";
import { isAudioLang } from "@/lib/audio/types";
import { error, handle, json } from "@/lib/http";

// Missing languages are translated on the first request.
export const maxDuration = 60;

/** A tour in one language: ?lang=ar|en|ur|id|tr|fr (&preview=1 shows drafts to the team). */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang") || "ar";
  if (!isAudioLang(lang)) return error("invalidLanguage", 400);
  const drafts = q.get("preview") === "1" && !!(await currentUser())?.isAdmin;
  const tour = await tourView((await params).id, lang, { drafts });
  return tour ? json({ tour }) : error("notFound", 404);
});
