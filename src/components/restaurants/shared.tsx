"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { addDaysISO, fmtDay, ksaDay } from "@/lib/events/format";
import type { Restaurant } from "@/lib/restaurants/catalog";
import { useApp } from "../app-provider";
import { cx, Spinner } from "../ui";

export interface SlotView { time: string; left: number; bookable: boolean }

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-gold-600" aria-label={`${rating} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="size-3.5" fill={i < Math.round(rating) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="m10 1.8 2.5 5.2 5.7.8-4.1 4 1 5.7L10 14.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" />
        </svg>
      ))}
      <span className="ms-1 text-xs font-bold text-ink">{rating.toFixed(1)}</span>
    </span>
  );
}

export const priceSigns = (level: number) => "﷼".repeat(level);

/** Date chips, guest count and seating times for a restaurant. */
export function SlotPicker({ restaurant: r, day, party, time, onDay, onParty, onTime, days = 14, autoAdvance = false }: {
  restaurant: Restaurant; day: string; party: number; time: string | null;
  onDay: (d: string) => void; onParty: (n: number) => void; onTime: (t: string | null) => void; days?: number;
  /** Start on the first day with a bookable time (e.g. late in the evening, today is over). */
  autoAdvance?: boolean;
}) {
  const { t, locale } = useApp();
  const d = t.restaurants.details;
  const today = ksaDay(new Date());
  const dayList = useMemo(() => {
    const list = Array.from({ length: days }, (_, i) => addDaysISO(today, i));
    // A later day chosen from a link (e.g. a trip plan) is shown at the end of the list.
    return day > list[list.length - 1] ? [...list, day] : list;
  }, [today, days, day]);
  const [slots, setSlots] = useState<SlotView[] | null>(null);
  const advanced = useRef(!autoAdvance);

  useEffect(() => {
    setSlots(null);
    fetch(`/api/restaurants/${encodeURIComponent(r.id)}/availability?day=${day}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { slots: [] }))
      .then((x: { slots: SlotView[] }) => setSlots(x.slots))
      .catch(() => setSlots([]));
  }, [r.id, day]);

  useEffect(() => {
    if (!slots || advanced.current) return;
    if (slots.some((x) => x.bookable && x.left >= party)) advanced.current = true;
    else {
      const next = dayList[dayList.indexOf(day) + 1];
      if (next && dayList.indexOf(day) >= 0 && dayList.indexOf(day) < 3) onDay(next);
      else advanced.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  // Drop a chosen time that no longer fits the party.
  useEffect(() => {
    if (!slots || !time) return;
    const s = slots.find((x) => x.time === time);
    if (!s || !s.bookable || s.left < party) onTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, party]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{d.date}</p>
        <div className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {dayList.map((x) => (
            <button key={x} type="button" onClick={() => { advanced.current = true; onDay(x); onTime(null); }} aria-pressed={x === day}
              className={cx("flex w-14 shrink-0 flex-col items-center rounded-xl border py-1.5 text-center", x === day ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 bg-white hover:border-brand-500")}>
              <span className="text-[11px] opacity-80">{fmtDay(x, locale, { weekday: "short" })}</span>
              <span className="text-lg font-bold leading-tight">{fmtDay(x, locale, { day: "numeric" })}</span>
              <span className="text-[11px] opacity-80">{fmtDay(x, locale, { month: "short" })}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{d.party}</p>
          <p className="text-xs text-slate-500">{fmt(d.maxParty, { n: r.maxParty })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={`${d.party} −`} onClick={() => onParty(Math.max(1, party - 1))} disabled={party <= 1} className="grid size-9 place-items-center rounded-full border border-slate-300 text-lg font-bold disabled:opacity-30">−</button>
          <span className="w-8 text-center text-lg font-bold" aria-live="polite" data-testid="party">{party}</span>
          <button type="button" aria-label={`${d.party} +`} onClick={() => onParty(Math.min(r.maxParty, party + 1))} disabled={party >= r.maxParty} className="grid size-9 place-items-center rounded-full border border-brand-700 text-lg font-bold text-brand-800 disabled:opacity-30">+</button>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">{d.time}</p>
        {slots === null ? (
          <p className="flex items-center gap-2 py-4 text-sm text-slate-500"><Spinner className="size-4" />{d.loading}</p>
        ) : !slots.some((s) => s.bookable && s.left >= party) ? (
          <p className="py-3 text-sm text-slate-500">{d.noSlots}</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6" data-testid="slots">
            {slots.map((s) => {
              const ok = s.bookable && s.left >= party;
              return (
                <button key={s.time} type="button" disabled={!ok} onClick={() => onTime(s.time)} aria-pressed={time === s.time} data-time={s.time}
                  className={cx("rounded-lg border py-2 text-sm font-bold ltr-nums", time === s.time ? "border-gold-500 bg-gold-500 text-white" : ok ? "border-slate-300 hover:border-brand-500" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300 line-through")}>
                  {s.time}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
