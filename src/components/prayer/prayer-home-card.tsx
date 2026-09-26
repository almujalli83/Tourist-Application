"use client";

import Link from "next/link";
import { cityName } from "@/lib/data/cities";
import { isFriday, ksaNow, nextPrayer } from "@/lib/prayer/times";
import { useApp } from "../app-provider";
import { ClockIcon } from "../icons";
import { useCountdown } from "./prayer-view";
import { usePrayerSettings, useNow } from "./settings";

/** Next prayer on the home page — only for travellers who turned it on. */
export function PrayerHomeCard() {
  const { t, locale } = useApp();
  const p = t.prayer;
  const [s, , ready] = usePrayerSettings();
  const now = useNow(30_000);
  const loc = s.loc;
  const { day, min } = ksaNow(now);
  const next = loc ? nextPrayer(day, min, loc.lat, loc.lng) : null;
  const countdown = useCountdown(next?.inMin ?? 0);
  if (!ready || !s.showHome || !loc || !next) return null;
  const name = next.name === "dhuhr" && isFriday(next.day) ? p.names.jumuah : p.names[next.name];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
      <Link href={`/${locale}/prayer`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-600/20 bg-white px-5 py-4 shadow-sm hover:shadow-md" data-testid="prayer-home">
        <span className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><ClockIcon className="size-5" /></span>
          <span>
            <span className="block text-xs text-slate-500">{p.homeCard}{loc.city ? ` · ${cityName(loc.city, locale)}` : ""}</span>
            <span className="block font-bold text-ink">{name} <span className="ltr-nums">{next.time}</span> <span className="text-sm font-medium text-brand-700">({countdown})</span></span>
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-700 underline">{p.open}</span>
      </Link>
    </div>
  );
}
