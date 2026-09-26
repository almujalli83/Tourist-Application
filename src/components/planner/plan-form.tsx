"use client";

import { useEffect, useState } from "react";
import { PACKAGE_LIMITS } from "@/lib/config";
import { ORIGIN_CITIES } from "@/lib/data/cities";
import { addDays, todayISO } from "@/lib/dates";
import { BUDGET_TIERS, INTERESTS, PACES, PLANNER_LIMITS, type PlanRequest, type TripPlan } from "@/lib/planner/types";
import type { CabinClass } from "@/lib/types";
import { useApp } from "../app-provider";
import { CityMultiSelect } from "../booking/city-multi-select";
import { CountrySelect } from "../booking/country-select";
import { GuestsRoomsPicker } from "../booking/guests-rooms-picker";
import { Alert, Button, Card, cx, Field, Input, Select, Textarea } from "../ui";

const FORM_KEY = "ta_plan_form";

type Form = Omit<PlanRequest, "nights" | "maxBudgetSAR"> & { nights: string; autoNights: boolean; autoCities: boolean; maxBudgetSAR: string };

const initial = (): Form => ({
  origin: "", nationality: "", departureDate: addDays(todayISO(), 21), nights: "5", autoNights: true, cities: [], autoCities: true,
  rooms: [{ adults: 2, childAges: [] }], cabin: "economy", interests: [], pace: "moderate", budgetTier: "comfort", maxBudgetSAR: "",
  prayer: false, accessible: false, notes: "",
});

/** Traveller preferences → a new plan. */
export function PlanForm({ cities, onGenerated }: { cities: string[] | null; onGenerated: (plan: TripPlan, warning: string | null, remaining: number) => void }) {
  const { t, locale } = useApp();
  const f = t.planner.form;
  const pl = t.planner;
  const today = todayISO();
  const [form, setForm] = useState<Form>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(FORM_KEY) ?? "null");
      if (saved?.rooms) {
        setForm({ ...initial(), ...saved });
        if (saved.prayer) setMoreOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((cur) => {
      const next = { ...cur, [k]: v };
      try {
        sessionStorage.setItem(FORM_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setErrors((e) => e.filter((x) => x !== k && !(k === "autoCities" && x === "cities") && !(k === "autoNights" && x === "nights")));
  };

  const hasKids = form.rooms.some((r) => r.childAges.length > 0);
  const e = (k: string) => (errors.includes(k) ? (pl.errors as Record<string, string>)[k] : undefined);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setErr(null);
    const request = {
      origin: form.origin, nationality: form.nationality, departureDate: form.departureDate,
      nights: form.autoNights ? null : Number(form.nights), cities: form.autoCities ? [] : form.cities,
      rooms: form.rooms, cabin: form.cabin, interests: form.interests, pace: form.pace, budgetTier: form.budgetTier,
      maxBudgetSAR: form.maxBudgetSAR.trim() ? Number(form.maxBudgetSAR) : null,
      prayer: form.prayer, accessible: form.accessible, notes: form.notes,
    };
    const local: string[] = [];
    if (!request.origin) local.push("origin");
    if (!request.nationality) local.push("nationality");
    if (!request.interests.length) local.push("interests");
    if (!form.autoCities && !form.cities.length) local.push("cities");
    if (local.length) {
      setErrors(local);
      document.getElementById(`plan-${local[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/planner/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request, locale }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.error === "invalidRequest" && Array.isArray(d.details)) {
          setErrors(d.details);
          document.getElementById(`plan-${d.details[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else setErr((pl.errors as Record<string, string>)[d.error] ?? pl.errors.generic);
        return;
      }
      onGenerated(d.plan, d.warning, d.remaining);
    } catch {
      setErr(pl.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean) =>
    cx("rounded-full border px-3.5 py-2 text-sm font-semibold transition", active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400");
  const toggleRow = (id: string, checked: boolean, onChange: (v: boolean) => void, label: string, hint: string) => (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3.5", checked ? "border-brand-600 bg-brand-50/60" : "border-slate-200 bg-white")}>
      <input id={id} type="checkbox" checked={checked} onChange={(x) => onChange(x.target.checked)} className="mt-1 size-4 accent-brand-700" />
      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
    </label>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card className="space-y-5 p-5 sm:p-7">
        <h2 className="text-lg font-bold">{f.tripTitle}</h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label={f.origin} required error={e("origin")} htmlFor="plan-origin">
            <Select id="plan-origin" value={form.origin} onChange={(x) => set("origin", x.target.value)} invalid={!!e("origin")}>
              <option value="">{f.originPlaceholder}</option>
              {ORIGIN_CITIES.map((c) => <option key={c.code} value={c.code}>{`${c[locale]} (${c.code})`}</option>)}
            </Select>
          </Field>
          <Field label={f.nationality} required error={e("nationality")} htmlFor="plan-nationality">
            <CountrySelect id="plan-nationality" value={form.nationality} onChange={(v) => set("nationality", v)} placeholder={f.nationalityPlaceholder} invalid={!!e("nationality")} />
          </Field>
          <Field label={f.departureDate} required error={e("departureDate")} htmlFor="plan-departureDate">
            <Input id="plan-departureDate" type="date" value={form.departureDate} min={addDays(today, PACKAGE_LIMITS.minLeadDays)} max={addDays(today, PACKAGE_LIMITS.maxLeadDays)} onChange={(x) => set("departureDate", x.target.value)} invalid={!!e("departureDate")} />
          </Field>
          <Field label={f.nights} error={e("nights")} htmlFor="plan-nights">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={chip(form.autoNights)} onClick={() => set("autoNights", true)} aria-pressed={form.autoNights}>{f.nightsAuto}</button>
              <button type="button" className={chip(!form.autoNights)} onClick={() => set("autoNights", false)} aria-pressed={!form.autoNights}>{f.nightsFixed}</button>
              {!form.autoNights && (
                <Input id="plan-nights" type="number" min={PLANNER_LIMITS.minNights} max={PLANNER_LIMITS.maxNights} value={form.nights} onChange={(x) => set("nights", x.target.value)} className="h-10 w-24 text-center" aria-label={f.nightsCount} invalid={!!e("nights")} />
              )}
            </div>
          </Field>
          <div className="lg:col-span-2">
            <Field label={f.cities} error={e("cities")} hint={!form.autoCities ? f.citiesHint : undefined} htmlFor="plan-cities">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={chip(form.autoCities)} onClick={() => set("autoCities", true)} aria-pressed={form.autoCities}>{f.citiesAuto}</button>
                  <button type="button" className={chip(!form.autoCities)} onClick={() => set("autoCities", false)} aria-pressed={!form.autoCities}>{f.citiesFixed}</button>
                </div>
                {!form.autoCities && <CityMultiSelect id="plan-cities" value={form.cities} onChange={(v) => set("cities", v)} allowed={cities ?? undefined} max={PLANNER_LIMITS.maxCities} invalid={!!e("cities")} />}
              </div>
            </Field>
          </div>
          <Field label={f.guests} required error={e("rooms")} htmlFor="plan-rooms">
            <GuestsRoomsPicker id="plan-rooms" value={form.rooms} onChange={(v) => set("rooms", v)} invalid={!!e("rooms")} />
          </Field>
          <Field label={f.cabin} htmlFor="plan-cabin">
            <Select id="plan-cabin" value={form.cabin} onChange={(x) => set("cabin", x.target.value as CabinClass)}>
              {(["economy", "premium", "business", "first"] as const).map((c) => <option key={c} value={c}>{t.search.cabins[c]}</option>)}
            </Select>
          </Field>
        </div>
        {hasKids && <p className="text-xs text-slate-500">{f.kidsNote}</p>}
      </Card>

      <Card className="space-y-6 p-5 sm:p-7">
        <h2 className="text-lg font-bold">{f.prefsTitle}</h2>
        <Field label={f.interests} required error={e("interests")} hint={f.interestsHint} htmlFor="plan-interests">
          <div id="plan-interests" className="flex flex-wrap gap-2" role="group">
            {INTERESTS.map((i) => {
              const on = form.interests.includes(i);
              return <button key={i} type="button" aria-pressed={on} className={chip(on)} onClick={() => set("interests", on ? form.interests.filter((x) => x !== i) : [...form.interests, i])}>{pl.interests[i]}</button>;
            })}
          </div>
        </Field>
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label={f.pace} htmlFor="plan-pace">
            <div id="plan-pace" className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {PACES.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={form.pace === p} onClick={() => set("pace", p)} className={cx("rounded-xl border p-3 text-start", form.pace === p ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-slate-200 bg-white hover:border-brand-300")}>
                  <span className="block text-sm font-bold">{pl.paces[p].t}</span>
                  <span className="block text-xs text-slate-500">{pl.paces[p].d}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label={f.budget} htmlFor="plan-budget">
            <div id="plan-budget" className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {BUDGET_TIERS.map((b) => (
                <button key={b} type="button" role="radio" aria-checked={form.budgetTier === b} onClick={() => set("budgetTier", b)} className={cx("rounded-xl border p-3 text-start", form.budgetTier === b ? "border-brand-700 bg-brand-50 ring-1 ring-brand-700" : "border-slate-200 bg-white hover:border-brand-300")}>
                  <span className="block text-sm font-bold">{pl.tiers[b].t}</span>
                  <span className="block text-xs text-slate-500">{pl.tiers[b].d}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label={f.maxBudget} hint={f.maxBudgetHint} error={e("maxBudgetSAR")} htmlFor="plan-maxBudgetSAR">
            <Input id="plan-maxBudgetSAR" type="number" inputMode="numeric" min={1000} step={500} value={form.maxBudgetSAR} onChange={(x) => set("maxBudgetSAR", x.target.value)} invalid={!!e("maxBudgetSAR")} />
          </Field>
          <div className="grid gap-2">
            {toggleRow("plan-accessible", form.accessible, (v) => set("accessible", v), f.accessible, f.accessibleHint)}
          </div>
        </div>
        <Field label={f.notes} htmlFor="plan-notes">
          <Textarea id="plan-notes" rows={3} maxLength={PLANNER_LIMITS.maxNotesChars} value={form.notes} onChange={(x) => set("notes", x.target.value)} placeholder={f.notesPlaceholder} />
        </Field>
        {/* Optional preferences most travellers don't need: folded away (open when one is already chosen). */}
        <details className="group rounded-xl border border-slate-200 px-4 py-3" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)} data-testid="plan-more-options">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">{f.moreOptions}</summary>
          <div className="mt-3 grid gap-2 sm:max-w-xl">
            {toggleRow("plan-prayer", form.prayer, (v) => set("prayer", v), f.prayer, f.prayerHint)}
          </div>
        </details>
      </Card>

      {err && <Alert tone="error">{err}</Alert>}
      {errors.length > 0 && (
        <Alert tone="error">
          <ul className="list-inside list-disc space-y-0.5">{errors.map((x) => <li key={x}>{(pl.errors as Record<string, string>)[x] ?? x}</li>)}</ul>
        </Alert>
      )}
      <div className="space-y-2">
        <Button type="submit" size="lg" className="w-full" loading={busy} data-testid="plan-submit">{busy ? f.generating : f.submit}</Button>
        {busy && <p className="text-center text-sm text-slate-500">{f.generatingHint}</p>}
      </div>
    </form>
  );
}
