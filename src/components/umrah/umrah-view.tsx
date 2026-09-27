"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { DAILY_PRAYERS, prayerTimes } from "@/lib/prayer/times";
import {
  IHRAM_DONTS, MIQATS, miqatMapUrl, RITE_LANG_NAMES, RITE_LANGS, RITES, ROUTE_MIQAT, ROUTES, TALBIYAH_AR, TALBIYAH_LATIN, type RiteLang, type Route,
} from "@/lib/umrah/content";
import type { NusukPermit } from "@/lib/umrah/nusuk";
import type { UmrahSeason } from "@/lib/umrah/season";
import type { UmrahTrip } from "@/lib/umrah/trips";
import { useApp } from "../app-provider";
import { ChevronIcon, ClockIcon, KaabaIcon, MapPinIcon, PassportIcon, PhoneIcon, UsersIcon } from "../icons";
import { Alert, Badge, Card, cx, Spinner } from "../ui";

interface Data { season: UmrahSeason; links: { web: string; ios: string; android: string }; linked: boolean; trips: UmrahTrip[] | null }

const ksaToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function NusukButtons({ links }: { links: Data["links"] }) {
  const { t } = useApp();
  const s = t.umrah.steps;
  const cls = "inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold";
  return (
    <span className="flex flex-wrap gap-2" data-testid="nusuk-links">
      <a href={links.web} target="_blank" rel="noopener noreferrer" className={cx(cls, "bg-brand-800 text-white hover:bg-brand-900")}>{s.web} ↗</a>
      <a href={links.ios} target="_blank" rel="noopener noreferrer" className={cx(cls, "bg-white text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50")}>{s.ios} ↗</a>
      <a href={links.android} target="_blank" rel="noopener noreferrer" className={cx(cls, "bg-white text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50")}>{s.android} ↗</a>
    </span>
  );
}

function TripCard({ trip, links }: { trip: UmrahTrip; links: Data["links"] }) {
  const { t, locale } = useApp();
  const u = t.umrah.trips;
  const d = (x: string) => fmtDay(x, locale, { weekday: "long", day: "numeric", month: "long" });
  const href = trip.bookingId ? `/${locale}/account/bookings/${trip.bookingId}` : trip.planId ? `/${locale}/planner/${trip.planId}` : null;
  const permitLine = (p: NusukPermit) => `${u.permitType[p.type]} · ${fmtDay(p.date, locale, { day: "numeric", month: "short" })}${p.time ? ` ${p.time}` : ""} · ${u.permitStatus[p.status]}`;
  return (
    <Card className="space-y-3 p-5" data-testid="umrah-trip">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">
          {trip.reference && <span className="ltr-nums" dir="ltr">{trip.reference}</span>}
          {!trip.bookingId && !trip.demo && <Badge className="ms-2">{u.draft}</Badge>}
          {trip.demo && <Badge tone="gold" className="ms-2">{t.umrah.sample}</Badge>}
        </p>
        {href && <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline">{trip.bookingId ? u.open : u.openPlan}</Link>}
      </div>
      <p className="text-sm text-slate-600">{fmt(u.makkah, { from: d(trip.makkahFrom), to: d(trip.makkahTo) })}</p>
      <p className="flex items-center gap-2 rounded-xl bg-gold-50 px-4 py-3 text-sm font-bold text-gold-700 ring-1 ring-gold-500/30" data-testid="umrah-day">
        <KaabaIcon className="size-5" />{u.day}: {d(trip.umrahDate)}
      </p>
      {trip.pause && <Alert tone="warning"><span data-testid="umrah-pause-trip">{fmt(t.umrah.pause.trip, { from: trip.pause.from, to: trip.pause.to })}</span></Alert>}
      <p className="text-sm leading-6 text-slate-700">{trip.route === "jeddah" ? u.viaJeddah : u.viaAir}</p>
      {trip.travellers.some((x) => x.permits) ? (
        <div>
          <p className="mb-1 text-sm font-bold">{u.permits}</p>
          <ul className="space-y-1 text-sm">
            {trip.travellers.map((x) => (
              <li key={x.name}><span dir="ltr">{x.name}</span>: {x.permits?.length ? x.permits.map(permitLine).join(" — ") : u.noPermit}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <NusukButtons links={links} />
    </Card>
  );
}

/** Umrah for tourists: Nusuk steps, the rites in several languages, the miqat, the traveller's trips. */
export function UmrahView() {
  const { t, locale, user } = useApp();
  const u = t.umrah;
  const [data, setData] = useState<Data | null>(null);
  const [lang, setLang] = useState<RiteLang>(locale);
  const [open, setOpen] = useState<string | null>("ihram");
  const [route, setRoute] = useState<Route>("air");

  useEffect(() => {
    fetch("/api/umrah", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => undefined);
  }, [user]);
  const today = ksaToday();
  const times = useMemo(() => prayerTimes(today, CITY_CENTERS.MKX.lat, CITY_CENTERS.MKX.lng), [today]);
  const miqat = ROUTE_MIQAT[route] ? MIQATS.find((m) => m.id === ROUTE_MIQAT[route]) : null;
  const rtl = lang === "ar" || lang === "ur";
  const ar = locale === "ar";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><KaabaIcon className="size-7 text-brand-700" />{u.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{u.intro}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{u.muslimsOnly}</p>
      </div>

      {data && (
        <Alert tone="warning">
          <span data-testid="umrah-pause">{data.season.pauseFrom && data.season.pauseTo ? fmt(u.pause.set, { from: fmtDay(data.season.pauseFrom, locale, { day: "numeric", month: "long", year: "numeric" }), to: fmtDay(data.season.pauseTo, locale, { day: "numeric", month: "long", year: "numeric" }) }) : u.pause.generic}</span>
        </Alert>
      )}

      {user && (
        <section className="space-y-3" data-testid="umrah-trips">
          <h2 className="text-lg font-bold">{u.trips.title}</h2>
          {!data ? (
            <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>
          ) : data.trips?.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">{data.trips.map((x) => <TripCard key={x.id} trip={x} links={data.links} />)}</div>
          ) : (
            <Card className="p-5 text-sm text-slate-600">{u.trips.none}</Card>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/planner?umrah=1`} className="inline-flex h-10 items-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-white hover:bg-gold-600" data-testid="umrah-plan">{u.trips.plan}</Link>
            <Link href={`/${locale}/package-visa?umrah=1`} className="inline-flex h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50" data-testid="umrah-book">{u.trips.book}</Link>
          </div>
        </section>
      )}

      <Card className="p-5" data-testid="umrah-steps">
        <h2 className="text-lg font-bold">{u.steps.title}</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {u.steps.list.map(([title, body], i) => (
            <li key={title} className="flex gap-3 rounded-xl bg-slate-50 p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-800 text-sm font-bold text-white">{i + 1}</span>
              <span><span className="block font-semibold">{title}</span><span className="mt-0.5 block text-sm text-slate-600">{body}</span></span>
            </li>
          ))}
        </ol>
        {data && <div className="mt-4"><NusukButtons links={data.links} /></div>}
        <p className="mt-3 text-xs text-slate-500">{u.steps.note}</p>
      </Card>

      <Card className="p-5" data-testid="umrah-rites">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{u.rites.title}</h2>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={u.rites.language}>
            {RITE_LANGS.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} data-testid={`rite-lang-${l}`}
                className={cx("h-8 rounded-full px-3 text-xs font-semibold", lang === l ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
                {RITE_LANG_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
        <ol className="mt-4 divide-y divide-slate-100" dir={rtl ? "rtl" : "ltr"} lang={lang}>
          {RITES.map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex w-full items-center justify-between gap-3 py-3 text-start font-semibold" data-testid="rite">
                <span><span className="me-2 text-brand-700">{i + 1}.</span>{r.title[lang]}</span>
                <ChevronIcon className={cx("size-4 shrink-0 transition-transform", open === r.id ? "-rotate-90" : "rotate-90")} />
              </button>
              {open === r.id && (
                <div className="space-y-3 pb-4 text-sm leading-7 text-slate-700" data-testid="rite-body">
                  <p>{r.body[lang]}</p>
                  {r.id === "talbiyah" && (
                    <div className="rounded-xl bg-brand-50 p-4 text-center">
                      <p className="text-lg leading-9 text-brand-900" dir="rtl" lang="ar">{TALBIYAH_AR}</p>
                      {lang !== "ar" && <p className="mt-2 text-sm italic text-slate-600" dir="ltr">{TALBIYAH_LATIN}</p>}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-2 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-bold">{u.rites.donts}</p>
          <ul className="mt-1 list-disc ps-5 text-sm text-slate-600">{(ar ? IHRAM_DONTS.ar : IHRAM_DONTS.en).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </Card>

      <Card className="p-5" data-testid="umrah-miqat">
        <h2 className="text-lg font-bold">{u.miqat.title}</h2>
        <p className="mt-3 text-sm font-semibold text-slate-600">{u.miqat.from}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROUTES.map((r) => (
            <button key={r} type="button" aria-pressed={route === r} onClick={() => setRoute(r)} data-testid={`route-${r}`}
              className={cx("h-8 rounded-full px-3 text-xs font-semibold", route === r ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
              {u.miqat.routes[r]}
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-brand-50 p-4 text-sm leading-6 text-brand-900" data-testid="miqat-answer">
          {miqat ? fmt(u.miqat.yours, { name: ar ? miqat.ar : miqat.en }) : route === "jeddah" ? u.trips.viaJeddah : u.miqat.air}
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {MIQATS.map((m) => (
            <li key={m.id} className={cx("rounded-xl p-3 ring-1", miqat?.id === m.id ? "bg-gold-50 ring-gold-500/40" : "ring-slate-200")}>
              <p className="font-semibold">{ar ? m.ar : m.en}</p>
              <p className="text-xs text-slate-600">{u.miqat.for}: {ar ? m.forAr : m.forEn}</p>
              <a href={miqatMapUrl(m.q)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><MapPinIcon className="size-3.5" />{u.miqat.map}</a>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5" data-testid="umrah-crowd">
          <h2 className="text-lg font-bold">{u.crowd.title}</h2>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-slate-700">{u.crowd.list.map((x) => <li key={x}>{x}</li>)}</ul>
        </Card>
        <Card className="p-5" data-testid="umrah-prayer">
          <h2 className="flex items-center gap-2 text-lg font-bold"><ClockIcon className="size-5 text-brand-700" />{u.related.prayerToday}</h2>
          <dl className="mt-3 grid grid-cols-5 gap-2 text-center text-sm">
            {DAILY_PRAYERS.map((p) => (
              <div key={p} className="rounded-lg bg-slate-50 py-2"><dt className="text-xs text-slate-500">{t.prayer.names[p]}</dt><dd className="ltr-nums font-bold">{times[p]}</dd></div>
            ))}
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-bold">{u.related.title}</h2>
        <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          {[
            { href: `/${locale}/prayer`, label: u.related.prayer, Icon: ClockIcon },
            { href: `/${locale}/guides?track=religious`, label: u.related.guides, Icon: UsersIcon },
            { href: `/${locale}/account/card`, label: u.related.card, Icon: PassportIcon },
            { href: `/${locale}/emergency`, label: u.related.emergency, Icon: PhoneIcon },
          ].map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50"><Icon className="size-4" />{label}</Link>
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-slate-500">{u.disclaimer}</p>
    </div>
  );
}
