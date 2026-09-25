"use client";

import Link from "next/link";
import { useState } from "react";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { CITY_TRANSPORT, DEFAULT_CITY, GENERAL_TIPS, INTERCITY, type ModeInfo, type ModeKind } from "@/lib/transport/content";
import { useApp } from "../app-provider";
import { BusIcon, CarIcon, CheckIcon, GlobeIcon, MapPinIcon, PlaneIcon, TicketIcon, TrainIcon } from "../icons";
import { Card, cx } from "../ui";

const ICONS: Record<ModeKind, (p: { className?: string }) => React.ReactElement> = {
  train: TrainIcon, metro: TrainIcon, bus: BusIcon, taxi: CarIcon, car: CarIcon, airport: PlaneIcon, flight: PlaneIcon, tour: MapPinIcon,
};
const FEATURED = ["RUH", "JED", "MED", "ULH", "DMM", "HOF", "ELQ", "HAS"];

/** Transport guide: between cities and within each city (information only). */
export function TransportView() {
  const { t, locale } = useApp();
  const tr = t.transport;
  const ar = locale === "ar";
  const [tab, setTab] = useState<string>("intercity");
  const featured = FEATURED.map((c) => SAUDI_CITIES.find((x) => x.code === c)!).filter(Boolean);
  const others = SAUDI_CITIES.filter((c) => !FEATURED.includes(c.code));
  const modes = tab === "intercity" ? INTERCITY : CITY_TRANSPORT[tab] ?? DEFAULT_CITY;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{tr.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{tr.subtitle}</p>
      </div>

      <div className="flex flex-col gap-4 overflow-hidden rounded-2xl bg-gradient-to-l from-brand-900 to-brand-700 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15"><TrainIcon className="size-6" /></span>
          <div>
            <h2 className="text-lg font-bold">{tr.trainCta.title}</h2>
            <p className="mt-1 max-w-2xl text-sm opacity-90">{tr.trainCta.body}</p>
          </div>
        </div>
        <Link href={`/${locale}/trains`} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-gold-500 px-6 text-sm font-semibold text-white hover:bg-gold-600">
          <TicketIcon className="size-4" />{tr.trainCta.button}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        <TabChip active={tab === "intercity"} onClick={() => setTab("intercity")}>{tr.intercity}</TabChip>
        {featured.map((c) => <TabChip key={c.code} active={tab === c.code} onClick={() => setTab(c.code)}>{ar ? c.ar : c.en}</TabChip>)}
        <label className="sr-only" htmlFor="tr-city">{tr.inCity}</label>
        <select id="tr-city" value={others.some((c) => c.code === tab) ? tab : ""} onChange={(e) => e.target.value && setTab(e.target.value)}
          className="h-9 rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold">
          <option value="">{tr.inCity}…</option>
          {others.map((c) => <option key={c.code} value={c.code}>{ar ? c.ar : c.en}</option>)}
        </select>
        {tab !== "intercity" && (
          <Link href={`/${locale}/guide?city=${tab}`} className="ms-auto inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            <MapPinIcon className="size-4" />{tr.stationsOnMap}
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2" data-testid="transport-modes">
        {modes.map((m, i) => <ModeCard key={`${tab}-${i}`} m={m} />)}
      </div>

      <Card className="p-5">
        <h2 className="font-bold">{tr.generalTips}</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-700">
          {GENERAL_TIPS.map((tip, i) => <li key={i} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-600" />{ar ? tip.ar : tip.en}</li>)}
        </ul>
      </Card>
    </div>
  );
}

function ModeCard({ m }: { m: ModeInfo }) {
  const { t, locale } = useApp();
  const tr = t.transport;
  const ar = locale === "ar";
  const Icon = ICONS[m.kind];
  const tips = ar ? m.tipsAr : m.tipsEn;
  return (
    <Card className="flex flex-col p-5" data-testid="transport-mode">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" /></span>
        <div>
          <p className="text-xs font-semibold text-brand-700">{tr.modes[m.kind]}</p>
          <h3 className="font-bold">{ar ? m.titleAr : m.titleEn}</h3>
        </div>
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-700">{ar ? m.bodyAr : m.bodyEn}</p>
      {tips && tips.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          {tips.map((tip, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold-500" />{tip}</li>)}
        </ul>
      )}
      {(m.link || m.trainBooking) && (
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
          {m.trainBooking && (
            <Link href={`/${locale}/trains`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
              <TicketIcon className="size-4" />{tr.bookTrain}
            </Link>
          )}
          {m.link && (
            <a href={m.link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              <GlobeIcon className="size-4" />{ar ? m.link.labelAr : m.link.labelEn}
            </a>
          )}
        </div>
      )}
    </Card>
  );
}

function TabChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={cx("h-9 rounded-full border px-4 text-sm font-semibold transition-colors", active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500")}>
      {children}
    </button>
  );
}
