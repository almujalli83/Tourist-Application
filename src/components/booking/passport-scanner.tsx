"use client";

import { useRef, useState } from "react";
import { parseMrzText, type MrzResult } from "@/lib/mrz";
import { useApp } from "../app-provider";
import { CameraIcon, PassportIcon } from "../icons";
import { Alert, Button, cx, Spinner } from "../ui";
import { estimateSkew, mrzCanvas, preparePassportImage, readAsDataURL, rotated, rotatedBy } from "./image-utils";

type Status = "idle" | "reading" | "success" | "partial" | "failed" | "engine";

class OcrEngineError extends Error {}

/** Reads the passport MRZ fully in the browser, trying several crops, thresholds and orientations. */
async function ocrMrz(img: HTMLImageElement): Promise<MrzResult | null> {
  let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
  let PSM: typeof import("tesseract.js")["PSM"];
  try {
    const t = await import("tesseract.js");
    PSM = t.PSM;
    // OCR runs fully in the browser from self-hosted assets (see scripts/copy-ocr-assets.mjs):
    // the passport image never leaves the device for recognition.
    worker = await t.createWorker("eng", undefined, {
      workerPath: process.env.NEXT_PUBLIC_TESSERACT_WORKER_PATH || "/tesseract/worker.min.js",
      corePath: process.env.NEXT_PUBLIC_TESSERACT_CORE_PATH || "/tesseract/core",
      langPath: process.env.NEXT_PUBLIC_TESSERACT_LANG_PATH || "/tesseract/lang",
    });
  } catch (err) {
    console.error("OCR engine failed to load", err);
    throw new OcrEngineError(String(err));
  }
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    });
    let best: MrzResult | null = null;
    // Diagnostics for support: run localStorage.setItem("ocrDebug", "1") in the browser console.
    let debug = false;
    try {
      debug = localStorage.getItem("ocrDebug") === "1";
    } catch {
      /* storage unavailable */
    }
    const portrait = img.naturalHeight > img.naturalWidth * 1.15;
    const orientations = portrait ? [1, 3, 0] : [0, 2];
    for (const turns of orientations) {
      const upright = turns ? rotated(img, turns) : img;
      const skew = estimateSkew(upright);
      const src = Math.abs(skew) >= 0.5 ? rotatedBy(upright, skew) : upright;
      for (const [portion, binarize] of [[0.3, true], [0.3, false], [0.45, true], [1, true]] as const) {
        const { data } = await worker.recognize(mrzCanvas(src, portion, binarize));
        const res = parseMrzText(data.text);
        if (debug) console.debug("[ocr]", JSON.stringify({ turns, skew, portion, binarize, text: data.text, valid: res?.valid }));
        if (res && (!best || res.confidence > best.confidence)) best = res;
        if (best && best.confidence === 1) return best;
      }
      if (best && best.confidence >= 0.75) return best;
    }
    return best;
  } finally {
    await worker.terminate();
  }
}

export function PassportScanner({ value, onImage, onParsed, error }: {
  value: string;
  onImage: (dataUrl: string) => void;
  onParsed: (r: MrzResult) => void;
  error?: string;
}) {
  const { t } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    if (!/^image\/(jpeg|png|gif)$/.test(file.type)) {
      setLocalError(t.travellers.errors.imageType);
      return;
    }
    setStatus("reading");
    try {
      const { dataUrl, img } = await preparePassportImage(await readAsDataURL(file));
      onImage(dataUrl);
      const res = await ocrMrz(img);
      if (res) {
        onParsed(res);
        setStatus(res.confidence === 1 ? "success" : "partial");
      } else setStatus("failed");
    } catch (err) {
      setStatus(err instanceof OcrEngineError ? "engine" : "failed");
    }
  }

  const msg = {
    success: t.travellers.passportScan.success,
    partial: t.travellers.passportScan.partial,
    failed: t.travellers.passportScan.failed,
    engine: t.travellers.passportScan.engine,
  }[status as "success"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t.travellers.passportScan.title}<span className="ms-0.5 text-red-600">*</span></p>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx(
          "relative grid aspect-[1.42] w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed bg-slate-50 transition hover:border-brand-500",
          error || localError ? "border-red-400" : "border-slate-300",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 p-4 text-center text-slate-500">
            <PassportIcon className="size-10 text-brand-600" />
            <span className="text-sm font-medium text-brand-800">{t.travellers.passportScan.upload}</span>
            <span className="text-xs">{t.travellers.passportScan.hint}</span>
          </span>
        )}
        {status === "reading" && (
          <span className="absolute inset-0 grid place-items-center bg-white/80 text-sm font-medium text-brand-800">
            <span className="flex items-center gap-2"><Spinner className="size-5" />{t.travellers.passportScan.reading}</span>
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/gif" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      {value && (
        <Button type="button" size="sm" variant="secondary" onClick={() => input.current?.click()}>
          <CameraIcon className="size-4" />{t.travellers.passportScan.replace}
        </Button>
      )}
      {msg && <Alert tone={status === "success" ? "success" : status === "partial" ? "warning" : "error"}>{msg}</Alert>}
      {(localError || error) && <p className="text-xs font-medium text-red-600">{localError ?? error}</p>}
    </div>
  );
}
