"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { contentLocale, UI_COOKIE, UI_LANG_NAMES, UI_LANGS, type UiLang } from "@/i18n/config";
import { useApp } from "./app-provider";
import { CheckIcon, GlobeIcon } from "./icons";
import { cx } from "./ui";

/** Interface language: Arabic and English pages, and interface translations over the English pages. */
export function LanguageMenu({ compact, className, onPick }: { compact?: boolean; className?: string; onPick?: () => void }) {
  const { t, uiLang } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  function pick(l: UiLang) {
    const year = 60 * 60 * 24 * 365;
    document.cookie = `${UI_COOKIE}=${l}; path=/; max-age=${year}; samesite=lax`;
    document.cookie = `ta_locale=${contentLocale(l)}; path=/; max-age=${year}; samesite=lax`;
    onPick?.();
    // A full load: the interface language is chosen on the server.
    location.assign(pathname.replace(/^\/(ar|en)(?=\/|$)/, `/${contentLocale(l)}`) + location.search);
  }
  return (
    <div ref={box} className={cx("relative", className)}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label={t.nav.language}
        className={cx("flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium hover:bg-white/10", compact && "bg-white/10 px-3")} data-testid="lang-button">
        <GlobeIcon className="size-4" />
        <span>{compact ? t.nav.language : uiLang.toUpperCase()}</span>
      </button>
      {open && (
        <ul role="menu" className="absolute end-0 top-11 z-50 w-48 overflow-hidden rounded-xl bg-white py-1 text-ink shadow-2xl ring-1 ring-slate-200" data-testid="lang-menu">
          {UI_LANGS.map((l) => (
            <li key={l} role="none">
              <button type="button" role="menuitemradio" aria-checked={l === uiLang} lang={l} dir={l === "ar" || l === "ur" ? "rtl" : "ltr"} onClick={() => pick(l)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-sm hover:bg-brand-50" data-testid={`lang-${l}`}>
                {UI_LANG_NAMES[l]}
                {l === uiLang && <CheckIcon className="size-4 text-brand-700" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
