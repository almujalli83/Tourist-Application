"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cleanNational, flagEmoji, formatE164, parsePhone, PHONE_RULES, phoneCountries } from "@/lib/phone";
import { useApp } from "./app-provider";
import { cx, Input } from "./ui";

/**
 * Mobile number field: country calling code picker + national number limited to the country's
 * length. Emits the number in E.164 form ("+9665XXXXXXXX"), or "" while empty.
 */
export function PhoneInput({ value, onChange, defaultCountry = "SA", invalid, id }: {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: string;
  invalid?: boolean;
  id?: string;
}) {
  const { locale, t } = useApp();
  const fallback = PHONE_RULES[defaultCountry] ? defaultCountry : "SA";
  const [country, setCountry] = useState(() => parsePhone(value, fallback)?.iso2 ?? fallback);
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

  const parsed = parsePhone(value, country);
  const national = parsed ? parsed.national : cleanNational(value);

  return (
    <div className="flex gap-2" dir="ltr">
      <select
        aria-label={t.travellers.fields.countryCode}
        value={country}
        onChange={(e) => {
          setCountry(e.target.value);
          const max = PHONE_RULES[e.target.value].max;
          onChange(formatE164(e.target.value, national.slice(0, max)));
        }}
        className={cx(
          "h-11 w-32 shrink-0 rounded-lg border bg-white px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500",
        )}
      >
        {countries.map((c) => (
          <option key={c.iso2} value={c.iso2}>{`${flagEmoji(c.iso2)} +${c.dial} ${c.name}`}</option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        value={national}
        maxLength={rule.max + 1}
        placeholder={"X".repeat(rule.max)}
        onChange={(e) => onChange(formatE164(country, cleanNational(e.target.value).slice(0, rule.max)))}
        invalid={invalid}
        aria-describedby={id ? `${id}-len` : undefined}
      />
      <span id={id ? `${id}-len` : undefined} className="sr-only">
        {fmt(t.travellers.fields.mobileLength, { n: rule.min === rule.max ? String(rule.min) : `${rule.min}–${rule.max}` })}
      </span>
    </div>
  );
}

/** Hint text: expected number of digits for the selected country. */
export function phoneHint(value: string, defaultCountry: string, template: string): string {
  const iso = parsePhone(value, defaultCountry)?.iso2 ?? (PHONE_RULES[defaultCountry] ? defaultCountry : "SA");
  const r = PHONE_RULES[iso];
  return fmt(template, { n: r.min === r.max ? String(r.min) : `${r.min}–${r.max}` });
}
