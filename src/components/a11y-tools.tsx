"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "./app-provider";
import { AccessibilityIcon, XIcon } from "./icons";
import { cx } from "./ui";

export interface A11yPrefs { text: 0 | 1 | 2 | 3; contrast: boolean; links: boolean; spacing: boolean; motion: boolean; grayscale: boolean }
const KEY = "ta_a11y";
const DEFAULT: A11yPrefs = { text: 0, contrast: false, links: false, spacing: false, motion: false, grayscale: false };

/** Applied before the page paints (inline script in the layout). */
export const A11Y_BOOT = `try{var p=JSON.parse(localStorage.getItem("${KEY}")||"{}"),h=document.documentElement;if(p.text)h.dataset.a11yText=p.text;["contrast","links","spacing","motion","grayscale"].forEach(function(k){if(p[k])h.setAttribute("data-a11y-"+k,"")})}catch(e){}`;

function apply(p: A11yPrefs) {
  const h = document.documentElement;
  if (p.text) h.dataset.a11yText = String(p.text);
  else delete h.dataset.a11yText;
  for (const k of ["contrast", "links", "spacing", "motion", "grayscale"] as const) h.toggleAttribute(`data-a11y-${k}`, p[k]);
}

/** Header button with the viewer's accessibility options (kept on this device). */
export function A11yTools({ className }: { className?: string }) {
  const { t, locale } = useApp();
  const a = t.a11y;
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<A11yPrefs>(DEFAULT);
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try {
      setP({ ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || "{}") });
    } catch {
      // defaults
    }
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  const update = (next: A11yPrefs) => {
    setP(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // not saved
    }
  };
  const toggles = [["contrast", a.contrast], ["links", a.links], ["spacing", a.spacing], ["motion", a.motion], ["grayscale", a.grayscale]] as const;
  return (
    <div className={cx("relative", className)}>
      <button ref={button} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="a11y-panel" title={a.tools} aria-label={a.tools}
        className="grid size-9 place-items-center rounded-md hover:bg-white/10" data-testid="a11y-button">
        <AccessibilityIcon className="size-5" />
      </button>
      {open && (
        <div ref={panel} id="a11y-panel" role="dialog" aria-label={a.tools}
          className="absolute end-0 top-11 z-50 w-72 space-y-3 rounded-xl bg-white p-4 text-ink shadow-2xl ring-1 ring-slate-200" data-testid="a11y-panel">
          <div className="flex items-center justify-between">
            <p className="font-bold">{a.tools}</p>
            <button type="button" onClick={() => { setOpen(false); button.current?.focus(); }} aria-label={a.close} className="grid size-8 place-items-center rounded-full hover:bg-slate-100"><XIcon className="size-4" /></button>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">{a.textSize}</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => update({ ...p, text: Math.max(0, p.text - 1) as A11yPrefs["text"] })} disabled={p.text === 0} aria-label={a.smaller}
                className="h-9 flex-1 rounded-lg font-bold ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40">A−</button>
              <span className="w-12 text-center text-sm tabular-nums" aria-live="polite">{100 + p.text * 12.5}%</span>
              <button type="button" onClick={() => update({ ...p, text: Math.min(3, p.text + 1) as A11yPrefs["text"] })} disabled={p.text === 3} aria-label={a.bigger}
                className="h-9 flex-1 rounded-lg text-lg font-bold ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40" data-testid="a11y-bigger">A+</button>
            </div>
          </div>
          <div className="space-y-1">
            {toggles.map(([k, label]) => (
              <button key={k} type="button" role="switch" aria-checked={p[k]} onClick={() => update({ ...p, [k]: !p[k] })}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-slate-50" data-testid={`a11y-${k}`}>
                {label}
                <span className={cx("relative h-5 w-9 rounded-full transition-colors", p[k] ? "bg-brand-700" : "bg-slate-300")}>
                  <span className={cx("absolute top-0.5 size-4 rounded-full bg-white transition-all", p[k] ? "end-0.5" : "start-0.5")} />
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
            <button type="button" onClick={() => update(DEFAULT)} className="font-semibold text-brand-700 hover:underline">{a.reset}</button>
            <Link href={`/${locale}/accessibility`} onClick={() => setOpen(false)} className="font-semibold text-brand-700 hover:underline">{a.statement}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
