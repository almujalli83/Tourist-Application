"use client";

import { useRef, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_MESSAGE, type PublicTicket, type SupportMessage } from "@/lib/support/types";
import { useApp } from "../app-provider";
import { CameraIcon, XIcon } from "../icons";
import { Button, cx, Textarea } from "../ui";

export interface Attachment { name: string; data: string }

/** Reads a file for upload: photos are resized in the browser (longest side 1600px, JPEG). */
async function readAttachment(file: File): Promise<Attachment | null> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_ATTACHMENT_BYTES) return null;
    const data = await new Promise<string>((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = fail;
      r.readAsDataURL(file);
    });
    return { name: file.name, data };
  }
  if (!/^image\//.test(file.type)) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { name: file.name.replace(/\.\w+$/, "") + ".jpg", data: c.toDataURL("image/jpeg", 0.85) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Message box with attachments. */
export function Composer({ onSend, placeholder, busy, extra, initial = "", testId }: {
  onSend: (message: string, attachments: Attachment[], opts?: { close?: boolean }) => Promise<boolean>;
  placeholder: string;
  busy: boolean;
  extra?: (send: (opts?: { close?: boolean }) => void) => React.ReactNode;
  initial?: string;
  testId?: string;
}) {
  const { t } = useApp();
  const s = t.support;
  const [text, setText] = useState(initial);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list) return;
    setErr(null);
    const out: Attachment[] = [];
    for (const f of [...list].slice(0, MAX_ATTACHMENTS - files.length)) {
      const a = await readAttachment(f).catch(() => null);
      if (a) out.push(a);
      else setErr(s.errors.attachments);
    }
    setFiles((x) => [...x, ...out].slice(0, MAX_ATTACHMENTS));
  }
  const send = async (opts?: { close?: boolean }) => {
    if (!text.trim()) return setErr(s.errors.message);
    if (await onSend(text.trim(), files, opts)) {
      setText("");
      setFiles([]);
    }
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, MAX_MESSAGE))} rows={3} placeholder={placeholder} aria-label={placeholder} dir="auto" data-testid="composer-text" />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">
              {f.name}
              <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="×"><XIcon className="size-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" loading={busy} onClick={() => void send()} data-testid="composer-send">{t.support.send}</Button>
        {extra?.((o) => void send(o))}
        {files.length < MAX_ATTACHMENTS && (
          <button type="button" onClick={() => ref.current?.click()} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
            <CameraIcon className="size-4" />{s.attach}
          </button>
        )}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ""; }} data-testid="composer-file" />
        <span className="text-xs text-slate-400">{s.attachHint}</span>
      </div>
    </div>
  );
}

function Bubble({ ticket, m, viewer }: { ticket: PublicTicket; m: SupportMessage; viewer: "traveller" | "staff" }) {
  const { t, locale } = useApp();
  const s = t.support;
  const mine = viewer === "traveller" ? m.from === "traveller" : m.from === "staff";
  // Each side reads the other's messages in its own language (Arabic for the team).
  const wanted = viewer === "staff" ? "ar" : ticket.lang;
  const hasTr = !!m.translation && m.translation.lang === wanted && m.lang !== wanted;
  const [showTr, setShowTr] = useState(hasTr);
  const text = showTr && m.translation ? m.translation.text : m.text;
  const who = m.from === "traveller" ? (viewer === "traveller" ? s.you : null) : m.from === "staff" ? (viewer === "staff" ? m.author ?? s.team : s.team) : s.assistant;
  return (
    <div className={cx("flex", mine ? "justify-end" : "justify-start")} data-testid={`msg-${m.from}`}>
      <div className={cx("max-w-[85%] rounded-2xl px-4 py-3 text-sm", mine ? "bg-brand-700 text-white" : m.from === "assistant" ? "bg-gold-50 text-ink ring-1 ring-gold-500/30" : "bg-white text-ink ring-1 ring-slate-200")}>
        <p className={cx("mb-1 text-[11px] font-semibold", mine ? "text-brand-100" : "text-slate-500")}>
          {who && <>{who} · </>}{fmtKsa(m.at, locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="whitespace-pre-line leading-6" dir="auto" data-testid="msg-text">{text}</p>
        {m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <a key={a.id} href={`/api/support/files/${ticket.id}/${a.id}`} target="_blank" rel="noreferrer" className={cx("rounded-lg px-2 py-1 text-xs underline", mine ? "bg-white/15" : "bg-slate-100")}>📎 {a.name}</a>
            ))}
          </div>
        )}
        {hasTr && (
          <button type="button" onClick={() => setShowTr((x) => !x)} className={cx("mt-2 text-[11px] font-semibold underline", mine ? "text-brand-100" : "text-brand-700")}>
            {showTr ? `${fmt(s.translated, { lang: t.translate.languages[wanted] })} · ${s.showOriginal}` : s.showTranslation}
          </button>
        )}
      </div>
    </div>
  );
}

export function Conversation({ ticket, viewer }: { ticket: PublicTicket; viewer: "traveller" | "staff" }) {
  return (
    <div className="space-y-3" data-testid="conversation">
      {ticket.messages.map((m) => <Bubble key={m.id} ticket={ticket} m={m} viewer={viewer} />)}
    </div>
  );
}
