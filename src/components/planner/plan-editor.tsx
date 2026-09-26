"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { todayISO } from "@/lib/dates";
import { fmtDay } from "@/lib/events/format";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks } from "@/lib/guide/geo";
import { validateCriteria } from "@/lib/itinerary";
import { withActivities } from "@/lib/planner/budget";
import { planCriteria, writeGuestPlan, writeHandoff } from "@/lib/planner/handoff";
import { dayWarnings, fmtMin, scheduleDay, type ScheduledEntry } from "@/lib/planner/schedule";
import { isFlexible, maxItems, type PlanDay, type PlanItem, type TripPlan } from "@/lib/planner/types";
import { STATIONS, LINES } from "@/lib/trains/network";
import { useApp } from "../app-provider";
import { GuideMap, type GuideCategory, type MapPoint } from "../guide/guide-map";
import { CalendarIcon, ClockIcon, DirectionsIcon, MapPinIcon, PlaneIcon, RefreshIcon, TicketIcon, TrainIcon, XIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Spinner } from "../ui";
import { ActivityPicker } from "./activity-picker";

const cityName = (code: string, locale: "ar" | "en") => SAUDI_CITIES.find((c) => c.code === code)?.[locale] ?? code;

/** Train link between two plan cities when they share a SAR line. */
function trainHref(from: string, to: string, date: string): string | null {
  for (const line of LINES) {
    const a = STATIONS.find((s) => s.line === line.id && s.city === from);
    const b = STATIONS.find((s) => s.line === line.id && s.city === to);
    if (a && b) return `/trains?from=${a.code}&to=${b.code}&date=${date}`;
  }
  return null;
}

const MAP_CATEGORIES: GuideCategory[] = ["landmark", "heritage", "museum", "nature", "beach", "park", "shopping", "entertainment", "mosque", "restaurant", "cafe"];
const mapCategory = (i: PlanItem): GuideCategory => (i.kind === "event" ? "event" : MAP_CATEGORIES.includes(i.category as GuideCategory) ? (i.category as GuideCategory) : "landmark");

const payloadDays = (days: PlanDay[]) => days.map((d) => ({ date: d.date, title: d.title, items: d.items.map((i) => ({ id: i.id, ref: i.ref, note: i.note, meal: i.meal })) }));

type Picker = { mode: "swap" | "add"; date: string; itemId?: string } | null;

/** A plan: summary, budget, day-by-day programme with map, editing (drafts) and approval. */
export function PlanEditor({ initial, warning, onNew }: { initial: TripPlan; warning?: string | null; onNew?: () => void }) {
  const { t, locale, money, user } = useApp();
  const pl = t.planner;
  const p = pl.plan;
  const router = useRouter();
  const [plan, setPlan] = useState<TripPlan>(initial);
  const [dayIdx, setDayIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [regenerating, setRegenerating] = useState(false);
  const [picker, setPicker] = useState<Picker>(null);
  const [err, setErr] = useState<string | null>(null);
  const [approveErrors, setApproveErrors] = useState<string[]>([]);
  const version = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setPlan(initial), [initial]);
  const editable = plan.status === "draft";
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];
  const kids = plan.request.rooms.some((r) => r.childAges.length > 0);
  const ctx = useMemo(() => ({ pace: plan.request.pace, prayer: plan.request.prayer, kids }), [plan.request.pace, plan.request.prayer, kids]);
  const schedules = useMemo(() => plan.days.map((d) => scheduleDay(d, ctx, CITY_CENTERS[d.city] ?? CITY_CENTERS.RUH)), [plan.days, ctx]);
  const entries = useMemo(() => schedules[Math.min(dayIdx, plan.days.length - 1)] ?? [], [schedules, dayIdx, plan.days.length]);
  const guests = plan.request.rooms.reduce((a, r) => a + r.adults + r.childAges.length, 0);

  // Guests' plans live in the browser until they sign in.
  useEffect(() => {
    if (!plan.id) writeGuestPlan(plan);
  }, [plan]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const save = useCallback((next: TripPlan) => {
    if (!next.id) return;
    const v = ++version.current;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/planner/plans/${next.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: payloadDays(next.days) }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "saveFailed");
        // A newer edit is on its way: keep the local version.
        if (v === version.current) {
          setPlan(d.plan);
          setSaveState("saved");
        }
      } catch (e) {
        if (v === version.current) {
          setSaveState("error");
          setErr((pl.errors as Record<string, string>)[(e as Error).message] ?? pl.errors.saveFailed);
        }
      }
    }, 600);
  }, [pl.errors]);

  const commit = (date: string, change: (items: PlanItem[]) => PlanItem[], title?: string) => {
    setErr(null);
    setApproveErrors([]);
    setPlan((cur) => {
      const days = cur.days.map((d) => (d.date === date ? { ...d, title: title ?? d.title, items: change(d.items) } : d));
      const next = { ...cur, days, budget: withActivities(cur.budget, days, cur.request.maxBudgetSAR) };
      save(next);
      return next;
    });
  };

  const move = (date: string, id: string, dir: -1 | 1) =>
    commit(date, (items) => {
      const flex = items.filter(isFlexible);
      const i = flex.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= flex.length) return items;
      const a = items.indexOf(flex[i]);
      const b = items.indexOf(flex[j]);
      const out = [...items];
      [out[a], out[b]] = [out[b], out[a]];
      return out;
    });
  const remove = (date: string, id: string) => commit(date, (items) => items.filter((x) => x.id !== id));

  function onPick(item: PlanItem) {
    if (!picker) return;
    const { mode, date, itemId } = picker;
    setPicker(null);
    commit(date, (items) => {
      if (mode === "add") return [...items, item];
      return items.map((x) => (x.id === itemId ? { ...item, id: x.id, meal: item.meal ?? (x.meal && (item.kind === "restaurant" || item.category === "restaurant" || item.category === "cafe") ? x.meal : undefined) } : x));
    });
  }

  async function regenerate() {
    setRegenerating(true);
    setErr(null);
    try {
      const r = await fetch("/api/planner/regenerate-day", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, date: day.date }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr((pl.errors as Record<string, string>)[d.error] ?? pl.errors.generic);
        return;
      }
      commit(day.date, () => d.day.items, d.day.title);
    } finally {
      setRegenerating(false);
    }
  }

  function approve() {
    if (!plan.id) return;
    const criteria = planCriteria(plan);
    const errs = validateCriteria(criteria, todayISO());
    if (errs.length) {
      setApproveErrors(errs.map((e) => (t.search.errors as Record<string, string>)[e] ?? e));
      return;
    }
    writeHandoff(plan.id, criteria);
    router.push(`/${locale}/package-visa`);
  }

  const points: MapPoint[] = useMemo(() => {
    let n = 0;
    return entries.filter((e) => e.item).map((e) => ({ id: e.item!.id, lat: e.item!.lat, lng: e.item!.lng, category: mapCategory(e.item!), label: locale === "ar" ? e.item!.titleAr : e.item!.titleEn, badge: String(++n) }));
  }, [entries, locale]);
  const center = CITY_CENTERS[day.city] ?? CITY_CENTERS.RUH;
  const nights = plan.stays.reduce((a, s) => a + s.nights, 0);
  const usedRefs = useMemo(() => new Set(plan.days.flatMap((d) => d.items.map((i) => i.ref.split("@")[0]))), [plan.days]);
  const loginHref = `/${locale}/login?next=${encodeURIComponent(`/${locale}/planner?import=1`)}`;

  return (
    <div className="space-y-6" data-testid="plan-editor">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{pl.title}</h1>
            <Badge tone={plan.source === "claude" ? "brand" : "gold"}>{plan.source === "claude" ? pl.aiBadge : pl.rulesBadge}</Badge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1"><CalendarIcon className="size-4" />{fmt(p.dates, { from: fmtDay(plan.request.departureDate, locale), to: fmtDay(plan.returnDate, locale) })}</span>
            <span>{fmt(p.nightsN, { n: nights })}</span>
            {plan.stays.map((s, i) => (
              <span key={s.city} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{i + 1}. {cityName(s.city, locale)} · {fmt(p.nightsN, { n: s.nights })}</span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {saveState === "saving" && <span className="flex items-center gap-1 text-xs text-slate-500"><Spinner className="size-3.5" />{p.saving}</span>}
          {saveState === "saved" && <span className="text-xs text-brand-700">{p.saved}</span>}
          <Button variant="ghost" size="sm" onClick={() => window.print()}>{p.print}</Button>
          {onNew ? <Button variant="secondary" size="sm" onClick={onNew}>{p.newPlan}</Button> : <Link href={`/${locale}/planner`} className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50">{p.newPlan}</Link>}
        </div>
      </div>

      {warning === "aiUnavailable" && <Alert tone="warning">{pl.errors.aiUnavailable}</Alert>}
      {plan.status === "booked" && (
        <Alert tone="success">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{fmt(p.booked, { ref: plan.bookingReference ?? "" })} — {p.readOnly}</span>
            {plan.bookingId && <Link href={`/${locale}/account/bookings/${plan.bookingId}`} className="font-semibold underline">{p.viewBooking}</Link>}
          </span>
        </Alert>
      )}
      {err && <Alert tone="error">{err}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-5">
          <h2 className="font-bold">{p.summary}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700" dir="auto">{plan.summary}</p>
          {plan.tips.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-bold">{p.tips}</h3>
              <ul className="mt-1 list-disc space-y-1 ps-5 text-sm text-slate-600" dir="auto">{plan.tips.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </>
          )}
        </Card>
        <Card className="p-5" data-testid="plan-budget">
          <h2 className="font-bold">{p.budget.title}</h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            {([["flights", plan.budget.flightsSAR], ["hotels", plan.budget.hotelsSAR], ["activities", plan.budget.activitiesSAR], ["food", plan.budget.foodSAR], ["visa", plan.budget.visaSAR]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3"><dt className="text-slate-600">{p.budget[k]}</dt><dd className="font-medium">{money(v)}</dd></div>
            ))}
            <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 text-base"><dt className="font-bold">{p.budget.total}</dt><dd className="font-bold text-brand-800">{money(plan.budget.totalSAR)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-slate-500">{fmt(p.budget.min, { amount: money(plan.budget.packageMinSAR) })}</p>
          {plan.budget.overBudget && plan.request.maxBudgetSAR && <p className="mt-2 text-xs font-medium text-red-700">{fmt(p.budget.over, { max: money(plan.request.maxBudgetSAR) })}</p>}
          <p className="mt-2 text-xs text-slate-500">{p.budget.note}</p>
        </Card>
      </div>

      {/* Days */}
      <div className="-mx-4 overflow-x-auto px-4 print:hidden" role="tablist">
        <div className="flex gap-2">
          {plan.days.map((d, i) => {
            const w = dayWarnings(schedules[i]);
            return (
              <button key={d.date} type="button" role="tab" aria-selected={i === dayIdx} onClick={() => { setDayIdx(i); setSelected(null); }}
                className={cx("shrink-0 rounded-xl border px-3.5 py-2 text-start", i === dayIdx ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white hover:border-brand-300")}>
                <span className="block text-xs font-semibold opacity-80">{fmt(p.dayN, { n: i + 1 })} · {p.dayTypes[d.type]}</span>
                <span className="block text-sm font-bold">{fmtDay(d.date, locale, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className="flex items-center gap-1 text-xs opacity-80">{cityName(d.city, locale)}{w > 0 && <span className={cx("rounded-full px-1.5 text-[10px] font-bold", i === dayIdx ? "bg-white/20" : "bg-amber-100 text-amber-800")}>!{w}</span>}</span>
              </button>
            );
          })}
        </div>
      </div>

      {plan.days.map((d, i) => (
        <section key={d.date} className={cx("grid gap-6 lg:grid-cols-[1fr_420px]", i === dayIdx ? "" : "hidden print:grid")} aria-label={d.title}>
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-brand-700">{fmt(p.dayN, { n: i + 1 })} · {fmtDay(d.date, locale, { weekday: "long", day: "numeric", month: "long" })} · {cityName(d.city, locale)}</p>
                <h2 className="text-lg font-bold" dir="auto">{d.title}</h2>
              </div>
              {editable && i === dayIdx && (
                <div className="flex flex-wrap gap-2 print:hidden">
                  <Button size="sm" variant="secondary" onClick={() => setPicker({ mode: "add", date: d.date })} disabled={d.items.length >= maxItems(d.type, plan.request.pace)}>{p.actions.add}</Button>
                  <Button size="sm" variant="ghost" onClick={regenerate} loading={regenerating} data-testid="plan-regenerate"><RefreshIcon className="size-4" />{regenerating ? p.actions.regenerating : p.actions.regenerate}</Button>
                </div>
              )}
            </div>
            <ol className="mt-4 space-y-2" data-testid="plan-day">
              {schedules[i].map((e, k) => (
                <EntryRow key={`${e.kind}-${e.item?.id ?? e.prayer ?? k}`} entry={e} day={d} editable={editable} selected={selected === e.item?.id}
                  onSelect={() => setSelected(e.item?.id ?? null)} onMove={(dir) => e.item && move(d.date, e.item.id, dir)} onRemove={() => e.item && remove(d.date, e.item.id)}
                  onSwap={() => e.item && setPicker({ mode: "swap", date: d.date, itemId: e.item.id })}
                  canUp={!!e.item && isFlexible(e.item) && d.items.filter(isFlexible)[0]?.id !== e.item.id}
                  canDown={!!e.item && isFlexible(e.item) && d.items.filter(isFlexible).at(-1)?.id !== e.item.id} guests={guests} />
              ))}
            </ol>
            {d.items.length === 0 && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">{p.empty}</p>}
            {plan.request.prayer && <p className="mt-3 text-xs text-slate-500">{p.prayerApprox}</p>}
          </Card>
          <div className="print:hidden">
            {i === dayIdx && (
              <Card className="overflow-hidden lg:sticky lg:top-24">
                <p className="border-b border-slate-100 px-4 py-2.5 text-sm font-bold">{p.map}</p>
                <GuideMap className="relative h-72 sm:h-96" points={points} route={points} center={center} fitKey={`${d.date}|${points.map((x) => x.id).join(",")}`} selectedId={selected} onSelect={setSelected} unavailableText={p.mapUnavailable} />
              </Card>
            )}
          </div>
        </section>
      ))}

      {/* Approve */}
      {editable && (
        <Card className="space-y-3 border-2 border-brand-600 p-5 print:hidden">
          <h2 className="text-lg font-bold">{p.approve.title}</h2>
          <p className="text-sm text-slate-600">{p.approve.desc}</p>
          {approveErrors.length > 0 && (
            <Alert tone="error"><p className="font-semibold">{p.approve.invalid}</p><ul className="list-inside list-disc">{approveErrors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>
          )}
          {user && plan.id ? (
            <Button size="lg" className="w-full" onClick={approve} data-testid="plan-approve"><PlaneIcon className="size-5" />{p.approve.button}</Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">{p.approve.loginFirst}</p>
              <Link href={loginHref} onClick={() => writeGuestPlan(plan)} className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-700 text-base font-semibold text-white hover:bg-brand-800" data-testid="plan-login">{p.approve.login}</Link>
            </div>
          )}
        </Card>
      )}

      {picker && (
        <ActivityPicker
          title={picker.mode === "swap" ? pl.picker.swapTitle : pl.picker.addTitle}
          city={plan.days.find((d) => d.date === picker.date)!.city}
          date={picker.date}
          rooms={plan.request.rooms}
          used={usedRefs}
          mealOnly={picker.mode === "swap" && !!plan.days.find((d) => d.date === picker.date)?.items.find((x) => x.id === picker.itemId)?.meal}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

function EntryRow({ entry: e, day, editable, selected, onSelect, onMove, onRemove, onSwap, canUp, canDown, guests }: {
  entry: ScheduledEntry; day: PlanDay; editable: boolean; selected: boolean; guests: number;
  onSelect: () => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; onSwap: () => void; canUp: boolean; canDown: boolean;
}) {
  const { t, locale, money } = useApp();
  const p = t.planner.plan;
  const time = <span className="w-24 shrink-0 text-xs font-semibold tabular-nums text-slate-500" dir="ltr">{fmtMin(e.start)}{e.end > e.start ? `–${fmtMin(e.end)}` : ""}</span>;
  if (e.kind === "prayer") {
    return <li className="flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{time}<ClockIcon className="size-4" />{fmt(p.prayer, { name: p.prayerNames[e.prayer as keyof typeof p.prayerNames] })}</li>;
  }
  if (e.kind !== "item") {
    const train = e.kind === "travel" && day.fromCity ? trainHref(day.fromCity, day.city, day.date) : null;
    const text = e.kind === "arrival" ? p.arrival : e.kind === "departure" ? p.departure : fmt(p.transfer, { from: cityName(day.fromCity ?? "", locale), to: cityName(day.city, locale) });
    return (
      <li className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
        {time}<PlaneIcon className="size-4" /><span className="flex-1">{text}</span>
        {train && <Link href={`/${locale}${train}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><TrainIcon className="size-4" />{p.trainAlt}</Link>}
      </li>
    );
  }
  const it = e.item!;
  const title = locale === "ar" ? it.titleAr : it.titleEn;
  const dir = directionsLinks(it);
  return (
    <li className={cx("rounded-xl border bg-white p-3 transition", selected ? "border-brand-600 ring-1 ring-brand-600" : "border-slate-200")} data-testid="plan-item" data-ref={it.ref}>
      {e.travelMins ? <p className="mb-1.5 text-[11px] text-slate-400">↓ {fmt(p.travel, { n: e.travelMins })}</p> : null}
      <div className="flex gap-3">
        {time}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onSelect} className="text-start font-semibold hover:text-brand-700">{title}</button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {it.meal && <Badge tone="gold">{p.meals[it.meal]}</Badge>}
            {it.kind === "event" && <Badge tone="brand"><TicketIcon className="me-1 inline size-3" />{t.events.nav}</Badge>}
            {e.warnings.map((w) => <Badge key={w} tone="amber">{p.warnings[w]}</Badge>)}
          </div>
          {it.note && <p className="mt-1.5 text-sm text-slate-600" dir="auto">{it.note}</p>}
          {it.costSAR ? <p className="mt-1 text-xs text-slate-500">{fmt(p.ticketsFrom, { amount: money(it.costSAR) })} · {guests}×</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 print:hidden">
            {it.bookHref && (
              <Link href={`/${locale}${it.bookHref}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-gold-500 px-3 text-xs font-semibold text-ink hover:bg-gold-600" title={p.bookHint}>
                {it.kind === "event" ? p.book.event : p.book.restaurant}
              </Link>
            )}
            {it.bookHref && <span className="text-[11px] text-slate-400">{p.suggestBook}</span>}
            <a href={dir.google} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><DirectionsIcon className="size-3.5" />{p.actions.directions}</a>
            {editable && (
              <span className="ms-auto flex items-center gap-1">
                {isFlexible(it) && <button type="button" disabled={!canUp} onClick={() => onMove(-1)} className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label={p.actions.up}>↑ {p.actions.up}</button>}
                {isFlexible(it) && <button type="button" disabled={!canDown} onClick={() => onMove(1)} className="h-8 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30" aria-label={p.actions.down}>↓ {p.actions.down}</button>}
                <button type="button" onClick={onSwap} className="h-8 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50">{p.actions.swap}</button>
                <button type="button" onClick={onRemove} className="grid size-8 place-items-center rounded-lg text-red-700 hover:bg-red-50" aria-label={p.actions.remove} title={p.actions.remove}><XIcon className="size-4" /></button>
              </span>
            )}
          </div>
        </div>
        <MapPinIcon className="hidden size-4 shrink-0 text-slate-300 sm:block" />
      </div>
    </li>
  );
}
