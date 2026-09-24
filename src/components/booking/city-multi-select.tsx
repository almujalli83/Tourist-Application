"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { useApp } from "../app-provider";
import { CheckIcon, MapPinIcon, XIcon } from "../icons";
import { cx } from "../ui";

/** Strips Arabic diacritics/hamza variants and case so "العلا" matches "العُلا" and "alula" matches "AlUla". */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s-]/g, "");
}

/**
 * Ordered multi-select for arrival cities: a searchable dropdown plus numbered chips in trip
 * order (the itinerary, domestic flights and nights follow this order). Chips can be removed
 * or moved earlier/later.
 */
export function CityMultiSelect({ value, onChange, invalid, id }: {
  value: string[];
  onChange: (cities: string[]) => void;
  invalid?: boolean;
  id?: string;
}) {
  const { t, locale } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const byCode = useMemo(() => new Map(SAUDI_CITIES.map((c) => [c.code, c])), []);
  const q = normalize(query.trim());
  const options = useMemo(
    () =>
      SAUDI_CITIES.filter(
        (c) => !q || normalize(c.ar).includes(q) || normalize(c.en).includes(q) || c.code.toLowerCase().includes(q),
      ),
    [q],
  );

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && options[active]) toggle(options[active].code);
      else setOpen(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const name = (code: string) => byCode.get(code)?.[locale] ?? code;

  return (
    <div ref={wrapper} className="relative">
      {/* Selected cities in trip order */}
      <div
        className={cx(
          "flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition focus-within:ring-2 focus-within:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 focus-within:border-brand-500",
        )}
        onClick={() => {
          setOpen(true);
          search.current?.focus();
        }}
      >
        {value.map((code, i) => (
          <span key={code} className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-1 pe-1 ps-1.5 text-sm font-semibold text-brand-900 ring-1 ring-inset ring-brand-700/20">
            <span className="grid size-5 place-items-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{i + 1}</span>
            {name(code)}
            <span className="ms-0.5 inline-flex items-center">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); move(i, -1); }}
                disabled={i === 0}
                aria-label={`${t.search.moveEarlier}: ${name(code)}`}
                className="grid size-5 place-items-center rounded text-brand-700 hover:bg-brand-100 disabled:opacity-25"
              >
                <svg viewBox="0 0 20 20" className="size-3.5 rtl:rotate-180" aria-hidden><path fill="currentColor" d="M12.7 5.3a1 1 0 0 1 0 1.4L9.4 10l3.3 3.3a1 1 0 1 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0z" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); move(i, 1); }}
                disabled={i === value.length - 1}
                aria-label={`${t.search.moveLater}: ${name(code)}`}
                className="grid size-5 place-items-center rounded text-brand-700 hover:bg-brand-100 disabled:opacity-25"
              >
                <svg viewBox="0 0 20 20" className="size-3.5 rtl:rotate-180" aria-hidden><path fill="currentColor" d="M7.3 14.7a1 1 0 0 1 0-1.4l3.3-3.3-3.3-3.3a1 1 0 0 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4 0z" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(code); }}
                aria-label={`${t.search.removeCity}: ${name(code)}`}
                className="grid size-5 place-items-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          </span>
        ))}
        <input
          ref={search}
          id={id}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length ? t.search.addCity : t.search.destinationsPlaceholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="h-8 min-w-32 flex-1 bg-transparent px-1 text-sm text-ink placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      {open && (
        <>
          {/* Mobile: bottom sheet backdrop */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden />
          <div
            className={cx(
              "z-50 overflow-hidden border border-slate-200 bg-white shadow-xl",
              "fixed inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-full sm:mt-1 sm:max-h-none sm:rounded-xl",
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:hidden">
              <span className="font-bold">{t.search.destinations}</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-brand-700 px-4 py-1.5 text-sm font-semibold text-white">
                {t.common.close}
              </button>
            </div>
            <div className="border-b border-slate-100 p-2 sm:hidden">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t.search.searchCity}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <ul id={listId} role="listbox" aria-multiselectable className="max-h-[55vh] overflow-y-auto py-1 sm:max-h-80">
              {options.map((c, i) => {
                const idx = value.indexOf(c.code);
                const selected = idx >= 0;
                return (
                  <li key={c.code} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => toggle(c.code)}
                      className={cx(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-start",
                        i === active ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded border", selected ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300")}>
                        {selected && <CheckIcon className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                          <MapPinIcon className="size-4 shrink-0 text-gold-600" />
                          {c[locale]}
                          <span className="text-xs font-normal text-slate-400">{locale === "ar" ? c.en : c.ar}</span>
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">{locale === "ar" ? c.descriptionAr : c.descriptionEn}</span>
                      </span>
                      {selected && <span className="shrink-0 rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-bold text-white">{idx + 1}</span>}
                    </button>
                  </li>
                );
              })}
              {options.length === 0 && <li className="px-4 py-3 text-sm text-slate-400">{t.common.noResults}</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
