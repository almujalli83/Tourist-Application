"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { cleanNational, formatE164, parsePhone, PHONE_RULES, phoneCountries } from "@/lib/phone";
import { useApp } from "./app-provider";
import { cx, useFieldId } from "./ui";

/**
 * Mobile number field: a single control with a searchable country-code picker and the national
 * number (digits only, limited to the country's length). Emits E.164 ("+9665XXXXXXXX") or "".
 */
export function PhoneInput({ value, onChange, defaultCountry = "SA", invalid, id }: {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: string;
  invalid?: boolean;
  id?: string;
}) {
  const { locale, t } = useApp();
  const fieldId = useFieldId();
  const inputId = id ?? fieldId;
  const fallback = PHONE_RULES[defaultCountry] ? defaultCountry : "SA";
  const [country, setCountry] = useState(() => parsePhone(value, fallback)?.iso2 ?? fallback);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const numberInput = useRef<HTMLInputElement>(null);
  const countries = useMemo(() => phoneCountries(locale), [locale]);
  const rule = PHONE_RULES[country];

  // Follow the traveller's nationality while no number has been typed.
  useEffect(() => {
    if (!value && PHONE_RULES[defaultCountry]) setCountry(defaultCountry);
  }, [defaultCountry, value]);

  // Keep the picker in sync when the value is replaced from outside (e.g. "copy contact details").
  useEffect(() => {
    const parsed = parsePhone(value, country);
    if (parsed && PHONE_RULES[parsed.iso2].dial !== PHONE_RULES[country].dial) setCountry(parsed.iso2);
  }, [value, country]);

  // Close the list on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const parsed = parsePhone(value, country);
  const national = parsed ? parsed.national : cleanNational(value);
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  const filtered = q
    ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso2.toLowerCase() === q)
    : countries;

  function choose(iso2: string) {
    setCountry(iso2);
    setOpen(false);
    setQuery("");
    onChange(formatE164(iso2, national.slice(0, PHONE_RULES[iso2].max)));
    numberInput.current?.focus();
  }

  return (
    <div ref={wrapper} className="relative" dir="ltr">
      <div
        className={cx(
          "flex h-11 w-full items-stretch overflow-hidden rounded-lg border bg-white transition focus-within:ring-2 focus-within:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 focus-within:border-brand-500",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${t.travellers.fields.countryCode}: +${rule.dial}`}
          className="flex shrink-0 items-center gap-1.5 border-e border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-ink hover:bg-slate-100"
        >
          <span className="rounded bg-brand-700 px-1 py-0.5 text-[10px] font-bold leading-none text-white">{country}</span>
          <span className="tabular-nums">+{rule.dial}</span>
          <svg viewBox="0 0 20 20" className="size-4 text-slate-400" aria-hidden><path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" /></svg>
        </button>
        <input
          ref={numberInput}
          id={inputId}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          maxLength={rule.max + 1}
          placeholder={"0".repeat(rule.min)}
          onChange={(e) => onChange(formatE164(country, cleanNational(e.target.value).slice(0, rule.max)))}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm tracking-wide text-ink tabular-nums placeholder:text-slate-300 focus:outline-none"
        />
        <span className="flex shrink-0 items-center pe-3 text-xs tabular-nums text-slate-400" aria-hidden>
          {national.length}/{rule.max}
        </span>
      </div>

      {open && (
        <div className="absolute start-0 top-12 z-30 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" dir={locale === "ar" ? "rtl" : "ltr"}>
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered[0]) {
                  e.preventDefault();
                  choose(filtered[0].iso2);
                }
              }}
              placeholder={t.travellers.fields.searchCountry}
              className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.map((c) => (
              <li key={c.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso2 === country}
                  onClick={() => choose(c.iso2)}
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-brand-50",
                    c.iso2 === country && "bg-brand-50 font-semibold text-brand-800",
                  )}
                >
                  <span className="w-7 shrink-0 rounded bg-slate-100 py-0.5 text-center text-[10px] font-bold text-slate-600">{c.iso2}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500" dir="ltr">+{c.dial}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-slate-400">{t.common.noResults}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Hint text: expected number of digits for the selected country. */
export function phoneHint(value: string, defaultCountry: string, template: string): string {
  const iso = parsePhone(value, defaultCountry)?.iso2 ?? (PHONE_RULES[defaultCountry] ? defaultCountry : "SA");
  const r = PHONE_RULES[iso];
  return fmt(template, { n: r.min === r.max ? String(r.min) : `${r.min}–${r.max}` });
}
