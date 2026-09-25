"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "../app-provider";
import { CameraIcon } from "../icons";
import { Alert, Button, Card, cx, Spinner } from "../ui";

const LANGS = ["ar", "en", "zh", "fr", "de", "es", "tr", "ur", "id"] as const;
type Lang = (typeof LANGS)[number];
/** Speech recognition / synthesis locale per language. */
const SPEECH: Record<Lang, string> = { ar: "ar-SA", en: "en-US", zh: "zh-CN", fr: "fr-FR", de: "de-DE", es: "es-ES", tr: "tr-TR", ur: "ur-PK", id: "id-ID" };
const RTL = new Set<Lang>(["ar", "ur"]);

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;
const recognitionCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Resizes a photo in the browser (max 1600 px, JPEG) so it stays well under the upload limit. */
function shrinkImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("invalidImage"));
    };
    img.src = url;
  });
}

/** Live translation: text, voice (speak → translate → spoken reply) and photos of menus or signs. */
export function TranslateView() {
  const { t, locale } = useApp();
  const tr = t.translate;
  const [tab, setTab] = useState<"text" | "voice" | "image">("text");
  const [from, setFrom] = useState<Lang | "auto">("auto");
  const [to, setTo] = useState<Lang>(locale === "ar" ? "en" : "ar");
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "sandbox">("live");
  const recRef = useRef<Recognition | null>(null);
  const voiceSupported = typeof window !== "undefined" && !!recognitionCtor();
  const voiceFrom: Lang = from === "auto" ? (locale === "ar" ? "ar" : "en") : from;

  useEffect(() => {
    fetch("/api/assistant", { cache: "no-store" }).then((r) => r.json()).then((d) => setMode(d.mode)).catch(() => {});
    return () => recRef.current?.stop();
  }, []);

  const errText = (code: string) => (tr.errors as Record<string, string>)[code] ?? tr.errors.generic;

  async function call(payload: Record<string, unknown>): Promise<string | null> {
    setBusy(true);
    setErr(null);
    setResult("");
    try {
      const r = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(errText(d.error));
        return null;
      }
      setResult(d.translation);
      return d.translation as string;
    } finally {
      setBusy(false);
    }
  }

  function speak(text: string, lang: Lang) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH[lang];
    window.speechSynthesis.speak(u);
  }

  function startVoice() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setErr(tr.voiceUnsupported);
      return;
    }
    setErr(null);
    setHeard("");
    setResult("");
    const rec = new Ctor();
    rec.lang = SPEECH[voiceFrom];
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      const parts = Array.from(e.results);
      finalText = parts.map((r) => r[0].transcript).join(" ");
      setHeard(finalText);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setErr(tr.micDenied);
    };
    rec.onend = async () => {
      setListening(false);
      if (!finalText.trim()) return;
      const out = await call({ mode: "text", text: finalText, from: voiceFrom, to });
      if (out) speak(out, to);
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setErr(null);
    try {
      const data = await shrinkImage(file);
      setPreview(data);
      await call({ mode: "image", image: data, to });
    } catch {
      setErr(tr.errors.invalidImage);
    }
  }

  const langSelect = (value: string, onChange: (v: string) => void, label: string, withAuto: boolean) => (
    <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" aria-label={label}>
        {withAuto && <option value="auto">{tr.auto}</option>}
        {LANGS.map((l) => <option key={l} value={l}>{tr.languages[l]}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{tr.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tr.subtitle}</p>
      </div>
      {mode === "sandbox" && <Alert tone="warning">{tr.sandbox}</Alert>}

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {(["text", "voice", "image"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setErr(null); setResult(""); }}
            className={cx("h-10 rounded-md text-sm font-semibold", tab === k ? "bg-white text-brand-800 shadow-sm" : "text-slate-600")}>
            {tr.tabs[k]}
          </button>
        ))}
      </div>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          {tab !== "image" && langSelect(tab === "voice" ? voiceFrom : from, (v) => setFrom(v as Lang | "auto"), tr.from, tab === "text")}
          {tab !== "image" && (
            <button type="button" aria-label={tr.swap} title={tr.swap} onClick={() => { if (from !== "auto") { setFrom(to); setTo(from); } else { setFrom(to); setTo(locale === "ar" ? "ar" : "en"); } }}
              className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 text-lg font-bold text-brand-800 hover:bg-brand-50">⇄</button>
          )}
          {langSelect(to, (v) => setTo(v as Lang), tr.to, false)}
        </div>

        {tab === "text" && (
          <form onSubmit={(e) => { e.preventDefault(); if (!input.trim()) { setErr(tr.errors.empty); return; } void call({ mode: "text", text: input, from, to }); }} className="space-y-3">
            <textarea value={input} onChange={(e) => setInput(e.target.value.slice(0, 3000))} placeholder={tr.inputPlaceholder} aria-label={tr.inputPlaceholder} rows={5}
              dir={from !== "auto" && RTL.has(from) ? "rtl" : "auto"}
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
            <Button type="submit" loading={busy}>{busy ? tr.translating : tr.translate}</Button>
          </form>
        )}

        {tab === "voice" && (
          <div className="space-y-3 text-center">
            {!voiceSupported ? <Alert tone="warning">{tr.voiceUnsupported}</Alert> : (
              <button type="button" onClick={() => (listening ? recRef.current?.stop() : startVoice())} disabled={busy}
                className={cx("mx-auto grid size-24 place-items-center rounded-full text-sm font-bold text-white shadow-lg transition", listening ? "animate-pulse bg-red-600" : "bg-brand-700 hover:bg-brand-800")}>
                {listening ? tr.stop : tr.record}
              </button>
            )}
            {listening && <p className="text-sm text-slate-500">{tr.listening}</p>}
            {heard && <p className="rounded-lg bg-slate-50 p-3 text-sm"><span className="block text-xs text-slate-500">{tr.heard}</span><span dir="auto">{heard}</span></p>}
          </div>
        )}

        {tab === "image" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{tr.imageHint}</p>
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800">
              <CameraIcon className="size-5" />{tr.chooseImage}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onImage(e.target.files?.[0])} data-testid="translate-image" />
            </label>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
            {preview && <img src={preview} alt="" className="max-h-64 rounded-lg border border-slate-200 object-contain" />}
          </div>
        )}

        {err && <Alert tone="error">{err}</Alert>}
        {busy && tab !== "text" && <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" />{tr.translating}</p>}
        {result && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4" data-testid="translation">
            <p className="text-xs font-semibold text-brand-700">{tr.result} · {tr.languages[to]}</p>
            <p className="mt-2 whitespace-pre-wrap text-base" dir={RTL.has(to) ? "rtl" : "ltr"}>{result}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => speak(result, to)}>{tr.speak}</Button>
              <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard?.writeText(result).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? tr.copied : tr.copy}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
