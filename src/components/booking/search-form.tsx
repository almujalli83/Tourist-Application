"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PACKAGE_LIMITS } from "@/lib/config";
import { ORIGIN_CITIES, SAUDI_CITIES } from "@/lib/data/cities";
import { addDays, diffDays, isValidISODate, todayISO } from "@/lib/dates";
import { splitNights, validateCriteria, type SearchError } from "@/lib/itinerary";
import type { CabinClass, CityStay, PaxCount, SearchCriteria } from "@/lib/types";
import { useApp } from "../app-provider";
import { MapPinIcon, PlaneIcon, UsersIcon } from "../icons";
import { Alert, Button, Card, cx, Field, Input, Select } from "../ui";
import { useBooking } from "./booking-context";
import { CountrySelect } from "./country-select";

function Counter({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-500">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} className="grid size-8 place-items-center rounded-full border border-slate-300 text-lg leading-none text-brand-800 disabled:opacity-30" aria-label={`- ${label}`}>−</button>
        <span className="w-5 text-center font-bold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} className="grid size-8 place-items-center rounded-full border border-slate-300 text-lg leading-none text-brand-800 disabled:opacity-30" aria-label={`+ ${label}`}>+</button>
      </div>
    </div>
  );
}

export function SearchForm() {
  const { t, locale } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const today = todayISO();
  const prev = booking.criteria;

  const [origin, setOrigin] = useState(prev?.origin ?? "");
  const [cities, setCities] = useState<string[]>(prev?.stays.map((s) => s.city) ?? []);
  const [departureDate, setDeparture] = useState(prev?.departureDate ?? addDays(today, 14));
  const [returnDate, setReturn] = useState(prev?.returnDate ?? addDays(today, 21));
  const [stays, setStays] = useState<CityStay[]>(prev?.stays ?? []);
  const [pax, setPax] = useState<PaxCount>(prev?.pax ?? { adults: 2, children: 0, infants: 0 });
  const [cabin, setCabin] = useState<CabinClass>(prev?.cabin ?? "economy");
  const [nationality, setNationality] = useState(prev?.nationality ?? "");
  const [errors, setErrors] = useState<SearchError[]>([]);

  const totalNights = isValidISODate(departureDate) && isValidISODate(returnDate) ? diffDays(departureDate, returnDate) : 0;

  // Re-distribute nights whenever the cities or trip length change (keeping manual edits otherwise).
  useEffect(() => {
    setStays((cur) => {
      const same = cur.length === cities.length && cur.every((s, i) => s.city === cities[i]) && cur.reduce((a, s) => a + s.nights, 0) === totalNights;
      return same ? cur : splitNights(cities, Math.max(totalNights, cities.length));
    });
  }, [cities, totalNights]);

  function toggleCity(code: string) {
    setCities((c) => (c.includes(code) ? c.filter((x) => x !== code) : [...c, code]));
  }

  function setNights(i: number, n: number) {
    setStays((cur) => cur.map((s, idx) => (idx === i ? { ...s, nights: Math.max(1, n) } : s)));
  }

  const criteria: SearchCriteria = useMemo(
    () => ({ origin, stays, departureDate, returnDate, pax, cabin, nationality }),
    [origin, stays, departureDate, returnDate, pax, cabin, nationality],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCriteria(criteria, today);
    setErrors(errs);
    if (errs.length) return;
    booking.setCriteria(criteria);
    router.push(`/${locale}/package-visa/flights`);
  }

  const err = (k: SearchError) => (errors.includes(k) ? t.search.errors[k] : undefined);
  const staysSum = stays.reduce((a, s) => a + s.nights, 0);

  return (
    <form onSubmit={submit} noValidate>
      <Card className="p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label={t.search.origin} required error={err("origin")} htmlFor="origin">
            <div className="relative">
              <PlaneIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)} invalid={!!err("origin")} className="ps-9">
                <option value="">{t.search.originPlaceholder}</option>
                {ORIGIN_CITIES.map((c) => (
                  <option key={c.code} value={c.code}>{`${c[locale]} (${c.code}) — ${c[locale === "ar" ? "airportAr" : "airportEn"]}`}</option>
                ))}
              </Select>
            </div>
          </Field>

          <Field label={t.search.nationality} required error={err("nationality")} htmlFor="nationality">
            <CountrySelect id="nationality" value={nationality} onChange={setNationality} placeholder={t.search.nationalityPlaceholder} invalid={!!err("nationality")} />
          </Field>

          <div className="lg:col-span-2">
            <Field label={t.search.destinations} required error={err("cities")} hint={t.search.destinationsHint}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {SAUDI_CITIES.map((c) => {
                  const idx = cities.indexOf(c.code);
                  const on = idx >= 0;
                  return (
                    <button
                      type="button"
                      key={c.code}
                      onClick={() => toggleCity(c.code)}
                      aria-pressed={on}
                      className={cx(
                        "relative flex flex-col items-start rounded-xl border p-3 text-start transition",
                        on ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200 bg-white hover:border-brand-400",
                      )}
                    >
                      {on && <span className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{idx + 1}</span>}
                      <span className="flex items-center gap-1.5 text-sm font-bold"><MapPinIcon className="size-4 text-gold-600" />{c[locale]}</span>
                      <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">{locale === "ar" ? c.descriptionAr : c.descriptionEn}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <Field label={t.search.departureDate} required error={err("leadTime") ?? err("dates")} htmlFor="dep">
              <Input id="dep" type="date" value={departureDate} min={addDays(today, PACKAGE_LIMITS.minLeadDays)} max={addDays(today, PACKAGE_LIMITS.maxLeadDays)} onChange={(e) => setDeparture(e.target.value)} invalid={!!(err("leadTime") || err("dates"))} />
            </Field>
            <Field label={t.search.returnDate} required error={err("duration")} htmlFor="ret">
              <Input id="ret" type="date" value={returnDate} min={addDays(departureDate, PACKAGE_LIMITS.minPackageDays)} max={addDays(departureDate, PACKAGE_LIMITS.maxPackageDays)} onChange={(e) => setReturn(e.target.value)} invalid={!!err("duration")} />
            </Field>
          </div>

          {stays.length > 1 && (
            <div className="lg:col-span-2">
              <Field label={t.search.nightsPerCity} error={err("nightsMismatch")}>
                <div className="flex flex-wrap items-center gap-2">
                  {stays.map((s, i) => (
                    <div key={s.city} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                      <span className="text-sm font-semibold">{SAUDI_CITIES.find((c) => c.code === s.city)?.[locale]}</span>
                      <Input id={`nights-${s.city}`} type="number" min={1} max={21} value={s.nights} onChange={(e) => setNights(i, Number(e.target.value))} className="h-8 w-16 text-center" aria-label={`${t.common.nights} ${s.city}`} />
                      <span className="text-xs text-slate-500">{t.common.nights}</span>
                    </div>
                  ))}
                  <span className={cx("text-sm font-medium", staysSum === totalNights ? "text-brand-700" : "text-red-600")}>
                    {t.search.totalNights}: {staysSum} / {totalNights}
                  </span>
                </div>
              </Field>
            </div>
          )}

          <div className="lg:col-span-2">
            <Field label={t.search.passengers} required error={err("pax") ?? err("maxAdults") ?? err("maxMinors") ?? err("infants")}>
              <div className="grid gap-2 sm:grid-cols-3">
                <Counter label={t.common.adults} hint={t.search.adultsHint} value={pax.adults} min={1} max={PACKAGE_LIMITS.maxAdults} onChange={(v) => setPax({ ...pax, adults: v, infants: Math.min(pax.infants, v) })} />
                <Counter label={t.common.children} hint={t.search.childrenHint} value={pax.children} min={0} max={PACKAGE_LIMITS.maxMinors - pax.infants} onChange={(v) => setPax({ ...pax, children: v })} />
                <Counter label={t.common.infants} hint={t.search.infantsHint} value={pax.infants} min={0} max={Math.min(pax.adults, PACKAGE_LIMITS.maxMinors - pax.children)} onChange={(v) => setPax({ ...pax, infants: v })} />
              </div>
            </Field>
          </div>

          <Field label={t.search.cabin} required htmlFor="cabin">
            <Select id="cabin" value={cabin} onChange={(e) => setCabin(e.target.value as CabinClass)}>
              {(["economy", "premium", "business", "first"] as const).map((c) => (
                <option key={c} value={c}>{t.search.cabins[c]}</option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end">
            <Button type="submit" size="lg" className="w-full">
              <UsersIcon className="size-5" />
              {t.search.submit}
            </Button>
          </div>
        </div>
        {errors.length > 0 && (
          <Alert tone="error" className="mt-6">
            <ul className="list-inside list-disc space-y-0.5">
              {errors.map((e) => <li key={e}>{t.search.errors[e]}</li>)}
            </ul>
          </Alert>
        )}
      </Card>
    </form>
  );
}
