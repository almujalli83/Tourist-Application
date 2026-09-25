"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { addDaysISO, fmtDay, fmtKsa, ksaDay, weekendRange } from "@/lib/events/format";
import { EVENT_CATEGORIES, type EventCategory, type EventItem, type Season } from "@/lib/events/types";
import { normalizeSearch } from "@/lib/guide/search";
import { useApp } from "../app-provider";
import { CalendarIcon, MapPinIcon, SearchIcon, TicketIcon } from "../icons";
import { Alert, Badge, Card, cx, Spinner } from "../ui";

export type EventSummary = EventItem & { minPriceSAR: number };
type When = "any" | "today" | "weekend" | "week" | "trip";
interface Trip { cities: string[]; from: string; to: string }

/** Accent colour per category (event cards without a season colour). */
export const EVENT_COLORS: Record<EventCategory, string> = {
  concert: "#7c3aed", theatre: "#be185d", sports: "#15803d", family: "#ea580c", culture: "#b45309", dining: "#9a3412", adventure: "#0369a1",
};

/** Experiences & events: season cards, quick filters and the events on sale. */
export function EventsView() {
  const { t, locale, money } = useApp();
  const ev = t.events;
  const ar = locale === "ar";
  const [data, setData] = useState<{ events: EventSummary[]; seasons: Season[]; trip: Trip | null } | null>(null);
  const [failed, setFailed] = useState(false);
  const [season, setSeason] = useState<string>("all");
  const [city, setCity] = useState("");
  const [when, setWhen] = useState<When>("any");
  const [category, setCategory] = useState<EventCategory | "all">("all");
  const [q, setQ] = useState("");
  const today = ksaDay(new Date());

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("season");
    if (s) setSeason(s);
    const c = params.get("city");
    if (c) setCity(c.toUpperCase());
    fetch("/api/events", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    if (season === "all") u.searchParams.delete("season");
    else u.searchParams.set("season", season);
    window.history.replaceState(null, "", u);
  }, [season]);

  const cityName = (code: string) => {
    const c = SAUDI_CITIES.find((x) => x.code === code);
    return c ? (ar ? c.ar : c.en) : code;
  };

  const range = useMemo((): [string, string] | null => {
    if (when === "today") return [today, today];
    if (when === "weekend") return weekendRange(today);
    if (when === "week") return [today, addDaysISO(today, 7)];
    if (when === "trip" && data?.trip) return [data.trip.from, data.trip.to];
    return null;
  }, [when, today, data?.trip]);

  const results = useMemo(() => {
    if (!data) return null;
    const needle = normalizeSearch(q);
    return data.events
      .filter((e) => season === "all" || e.seasonId === season)
      .filter((e) => !city || e.city === city)
      .filter((e) => when !== "trip" || !data.trip || data.trip.cities.includes(e.city))
      .filter((e) => category === "all" || e.category === category)
      .filter((e) => {
        if (!needle) return true;
        const hay = normalizeSearch([e.titleAr, e.titleEn, e.venueAr, e.venueEn, e.descriptionAr, e.descriptionEn].join(" "));
        return needle.split(" ").every((w) => hay.includes(w));
      })
      .map((e) => ({ e, sessions: range ? e.sessions.filter((s) => ksaDay(s.start) >= range[0] && ksaDay(s.start) <= range[1]) : e.sessions }))
      .filter((x) => x.sessions.length)
      .sort((a, b) => a.sessions[0].start.localeCompare(b.sessions[0].start));
  }, [data, season, city, when, category, q, range]);

  const seasonCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of data?.events ?? []) if (e.seasonId) c[e.seasonId] = (c[e.seasonId] ?? 0) + 1;
    return c;
  }, [data]);

  const cities = useMemo(() => [...new Set((data?.events ?? []).map((e) => e.city))], [data]);
  const activeSeason = data?.seasons.find((s) => s.id === season) ?? null;

  if (failed) return <Alert tone="error">{ev.loadError}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{ev.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{ev.subtitle}</p>
      </div>

      {/* Seasons */}
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-2 sm:-mx-2 sm:px-2" role="tablist" aria-label={ev.allSeasons}>
        <SeasonCard active={season === "all"} onClick={() => setSeason("all")} color="#05372b" title={ev.allSeasons} subtitle={fmt(ev.seasonEvents, { n: data.events.length })} />
        {data.seasons.map((s) => {
          const live = s.startDate <= today;
          return (
            <SeasonCard
              key={s.id}
              active={season === s.id}
              onClick={() => setSeason(season === s.id ? "all" : s.id)}
              color={s.color}
              title={ar ? s.nameAr : s.nameEn}
              subtitle={`${fmtDay(s.startDate, locale, { day: "numeric", month: "short" })} – ${fmtDay(s.endDate, locale)}`}
              badge={live ? ev.seasonNow : fmt(ev.seasonSoon, { date: fmtDay(s.startDate, locale, { day: "numeric", month: "long" }) })}
              live={live}
              count={seasonCounts[s.id] ?? 0}
              countLabel={fmt(ev.seasonEvents, { n: seasonCounts[s.id] ?? 0 })}
            />
          );
        })}
      </div>

      {activeSeason && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderInlineStart: `6px solid ${activeSeason.color}` }}>
            <div>
              <h2 className="text-lg font-bold">{ar ? activeSeason.nameAr : activeSeason.nameEn}</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">{ar ? activeSeason.descriptionAr : activeSeason.descriptionEn}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="brand"><CalendarIcon className="size-3.5" />{fmtDay(activeSeason.startDate, locale)} – {fmtDay(activeSeason.endDate, locale)}</Badge>
              <Badge><MapPinIcon className="size-3.5" />{activeSeason.cities.map(cityName).join(ar ? "، " : ", ")}</Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          <label className="sr-only" htmlFor="ev-city">{ev.city}</label>
          <select id="ev-city" value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30">
            <option value="">{ev.allCities}</option>
            {cities.map((c) => <option key={c} value={c}>{cityName(c)}</option>)}
          </select>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ev.search} aria-label={ev.search}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white ps-9 pe-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["any", "today", "weekend", "week", ...(data.trip ? ["trip" as const] : [])] as When[]).map((w) => (
            <Chip key={w} active={when === w} onClick={() => setWhen(w)}>{ev.when[w]}</Chip>
          ))}
        </div>
        {when === "trip" && data.trip && (
          <p className="text-xs text-slate-600">{fmt(ev.tripHint, { cities: data.trip.cities.map(cityName).join(ar ? "، " : ", "), from: fmtDay(data.trip.from, locale), to: fmtDay(data.trip.to, locale) })}</p>
        )}
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>{t.guide.all}</Chip>
          {EVENT_CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? "all" : c)} color={EVENT_COLORS[c]}>{ev.categories[c]}</Chip>
          ))}
        </div>
      </div>

      {results && results.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">{ev.noResults}</Card>
      ) : (
        <>
          <p className="text-xs font-medium text-slate-500">{fmt(ev.results, { n: results?.length ?? 0 })}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results?.map(({ e, sessions }) => {
              const s = data.seasons.find((x) => x.id === e.seasonId);
              const color = s?.color ?? EVENT_COLORS[e.category];
              const first = sessions[0].start;
              return (
                <li key={e.id}>
                  <Link href={`/${locale}/events/${e.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600" data-testid="event-card">
                    <div className="relative flex h-28 items-end justify-between p-4 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc 60%, #0b1f1a)` }}>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide opacity-90">{ev.categories[e.category]}</p>
                        {s && <p className="mt-0.5 text-xs opacity-80">{ar ? s.nameAr : s.nameEn}</p>}
                      </div>
                      <div className="rounded-xl bg-white/95 px-3 py-1.5 text-center text-ink shadow">
                        <p className="text-lg font-bold leading-none">{fmtKsa(first, locale, { day: "numeric" })}</p>
                        <p className="text-[11px] font-semibold text-slate-600">{fmtKsa(first, locale, { month: "short" })}</p>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h2 className="font-bold text-ink group-hover:text-brand-800">{ar ? e.titleAr : e.titleEn}</h2>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPinIcon className="size-3.5 shrink-0" />{ar ? e.venueAr : e.venueEn} · {cityName(e.city)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <CalendarIcon className="size-3.5 shrink-0" />
                        {fmt(ev.next, { date: fmtKsa(first, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
                        {sessions.length > 1 && <span>· {fmt(ev.sessions, { n: sessions.length })}</span>}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Badge tone={e.refund.refundable ? "brand" : "slate"}>{e.refund.refundable ? fmt(ev.refundable, { h: e.refund.cutoffHours }) : ev.final}</Badge>
                        {e.minAge && <Badge tone="amber">{fmt(ev.minAge, { n: e.minAge })}</Badge>}
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-4">
                        <p className="text-sm font-bold text-brand-800">{fmt(ev.from, { price: money(e.minPriceSAR) })}</p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700"><TicketIcon className="size-4" />{fmt(ev.via, { provider: ev.providers[e.provider] })}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function SeasonCard({ active, onClick, color, title, subtitle, badge, live, count, countLabel }: {
  active: boolean; onClick: () => void; color: string; title: string; subtitle: string; badge?: string; live?: boolean; count?: number; countLabel?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "relative flex h-32 w-56 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl p-4 text-start text-white shadow-sm transition",
        active ? "ring-4 ring-gold-500 ring-offset-2" : "opacity-90 hover:opacity-100",
      )}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}bb 55%, #0b1f1a)` }}
    >
      {badge && <span className={cx("self-start rounded-full px-2 py-0.5 text-[11px] font-bold", live ? "bg-gold-500 text-white" : "bg-white/20")}>{badge}</span>}
      <span className={cx(!badge && "mt-auto")}>
        <span className="block text-base font-bold leading-tight">{title}</span>
        <span className="mt-1 block text-xs opacity-85">{subtitle}</span>
        {countLabel !== undefined && count !== undefined && <span className="mt-0.5 block text-[11px] opacity-75">{countLabel}</span>}
      </span>
    </button>
  );
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors",
        active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500",
      )}
    >
      {color && !active && <span className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
