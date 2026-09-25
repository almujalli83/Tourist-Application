"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "../app-provider";
import { GlobeIcon, XIcon } from "../icons";
import { Badge, cx, Spinner } from "../ui";
import { RichText } from "./rich-text";

interface Msg { role: "user" | "assistant"; content: string; at: string }
const GUEST_KEY = "assistant:history";

const readGuest = (): Msg[] => {
  try {
    const v = JSON.parse(sessionStorage.getItem(GUEST_KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const writeGuest = (m: Msg[]) => {
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(m.slice(-20)));
  } catch {
    /* storage unavailable */
  }
};

const ChatIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.9A8 8 0 1 1 21 12z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
  </svg>
);

/** Floating assistant available on every page (visitors and signed-in travellers). */
export function AssistantWidget() {
  const { t, locale, user } = useApp();
  const a = t.assistant;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"live" | "sandbox">("sandbox");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // Following a link from a reply opens that page (the panel would cover it on phones).
  useEffect(() => setOpen(false), [pathname]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/assistant", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { mode: "live" | "sandbox"; remaining: number; history: Msg[] | null };
    setMode(d.mode);
    setRemaining(d.remaining);
    setMessages(d.history ?? readGuest());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, user, load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setErr(null);
    setBusy(true);
    setText("");
    const now = new Date().toISOString();
    const before = messages;
    const next: Msg[] = [...before, { role: "user", content: q, at: now }];
    setMessages(next);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q, locale, history: user ? undefined : before }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr((a.errors as Record<string, string>)[d.error] ?? a.errors.generic);
        setMessages(before);
        setText(q);
        return;
      }
      const done: Msg[] = [...next, { role: "assistant", content: d.reply, at: new Date().toISOString() }];
      setMessages(done);
      setRemaining(d.remaining);
      if (!user) writeGuest(done);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm(a.confirmClear)) return;
    if (user) await fetch("/api/assistant", { method: "DELETE" });
    else writeGuest([]);
    setMessages([]);
  }

  return (
    <div className="print:hidden">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={a.open}
          title={a.open}
          className="fixed bottom-5 end-5 z-[700] grid size-14 place-items-center rounded-full bg-brand-700 text-white shadow-xl ring-4 ring-white transition hover:bg-brand-800"
          data-testid="assistant-open"
        >
          <ChatIcon className="size-7" />
        </button>
      )}
      {open && (
        <section
          role="dialog"
          aria-label={a.title}
          className="fixed inset-0 z-[700] flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:end-5 sm:h-[600px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[400px] sm:rounded-2xl sm:ring-1 sm:ring-black/10"
          data-testid="assistant-panel"
        >
          <header className="flex items-start justify-between gap-2 rounded-t-2xl bg-brand-800 px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-bold">{a.title}{mode === "sandbox" && <Badge tone="gold">{a.sandbox}</Badge>}</p>
              <p className="text-xs text-brand-100/90">{a.subtitle}</p>
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/${locale}/translate`} onClick={() => setOpen(false)} title={a.translate} aria-label={a.translate} className="grid size-9 place-items-center rounded-full hover:bg-white/10">
                <GlobeIcon className="size-5" />
              </Link>
              <button type="button" onClick={() => setOpen(false)} aria-label={a.close} className="grid size-9 place-items-center rounded-full hover:bg-white/10"><XIcon className="size-5" /></button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4 text-sm" aria-live="polite" data-testid="assistant-messages">
            <div className="rounded-2xl rounded-ss-sm bg-white p-3 text-slate-700 shadow-sm ring-1 ring-slate-100">{a.welcome}</div>
            {loaded && messages.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {a.suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-50">{s}</button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[85%] rounded-2xl p-3", m.role === "user" ? "rounded-se-sm bg-brand-700 text-white" : "rounded-ss-sm bg-white text-slate-800 shadow-sm ring-1 ring-slate-100")} data-role={m.role}>
                  {m.role === "assistant" ? <RichText text={m.content} /> : <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                </div>
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-xs text-slate-500"><Spinner className="size-4" />{a.thinking}</p>}
            {!loaded && <div className="grid place-items-center py-6"><Spinner className="size-5 text-brand-600" /></div>}
            <div ref={endRef} />
          </div>

          <footer className="border-t border-slate-200 p-3">
            {err && <p className="mb-2 text-xs font-medium text-red-700" role="alert">{err}</p>}
            <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }}
                rows={1}
                placeholder={a.placeholder}
                aria-label={a.placeholder}
                className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <button type="submit" disabled={busy || !text.trim()} className="h-11 rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white disabled:opacity-40">{a.send}</button>
            </form>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>{user ? a.savedNote : a.guestNote}</span>
              <span className="flex items-center gap-2">
                {remaining !== null && <span>{fmt(a.remaining, { n: remaining })}</span>}
                {messages.length > 0 && <button type="button" onClick={clear} className="font-semibold text-red-700 hover:underline">{a.clear}</button>}
              </span>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}
