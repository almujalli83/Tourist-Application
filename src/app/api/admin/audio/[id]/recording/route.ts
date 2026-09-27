import { requireAdmin } from "@/lib/auth/admin";
import { AudioError, MAX_RECORDING, addRecording, removeRecording } from "@/lib/audio/tours";
import { isAudioLang } from "@/lib/audio/types";
import { error, handle, json } from "@/lib/http";

const fail = (e: unknown) => {
  if (e instanceof AudioError) return error(e.message, e.message === "notFound" ? 404 : 422);
  throw e;
};

/** Upload a recording: multipart form with stop, lang and file (MP3, M4A, OGG, WAV or WebM). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const form = await req.formData().catch(() => null);
  const stop = form?.get("stop");
  const lang = form?.get("lang");
  const file = form?.get("file");
  if (typeof stop !== "string" || !isAudioLang(lang) || !(file instanceof Blob)) return error("invalidRequest", 400);
  if (file.size > MAX_RECORDING) return error("fileTooLarge", 413);
  try {
    return json({ tour: await addRecording((await params).id, stop, lang, Buffer.from(await file.arrayBuffer())) });
  } catch (e) {
    return fail(e);
  }
});

export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const a = await requireAdmin();
  if (!a.ok) return a.response;
  const q = new URL(req.url).searchParams;
  const lang = q.get("lang");
  if (!isAudioLang(lang)) return error("invalidRequest", 400);
  try {
    return json({ tour: await removeRecording((await params).id, q.get("stop") ?? "", lang) });
  } catch (e) {
    return fail(e);
  }
});
