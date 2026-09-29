"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { METRO_LINE_IDS, METRO_LINES, nearestStation, type MetroLineId, type MetroStation } from "@/lib/metro/types";
import { useApp } from "../app-provider";
import { GuideMap, type MapPoint } from "../guide/guide-map";
import { LocateIcon, TrainIcon } from "../icons";
import { Card, cx, Spinner } from "../ui";
import { useMetro } from "./use-metro";

const RIYADH = { lat: 24.7136, lng: 46.6753, zoom: 11 };

export const lineName = (id: MetroLineId, ar: boolean) => (ar ? METRO_LINES[id].nameAr : METRO_LINES[id].nameEn);
export const stationName = (s: MetroStation, ar: boolean) => (ar ? s.nameAr : s.nameEn);

/** A small coloured dot per line. */
export function LineDots({ lines }: { lines: MetroLineId[] }) {
  return (
    <span className="inline-flex gap-0.5 align-middle" aria-hidden>
      {lines.map((l) => <span key={l} className="inline-block size-2.5 rounded-full ring-1 ring-white" style={{ background: METRO_LINES[l].color }} />)}
    </span>
  );
}

/** Riyadh Metro on the transport page: lines, stations on the map, nearest station, tickets and buses. */
export function MetroPanel() {
  const { t, locale } = useApp();
  const m = t.metro;
  const ar = locale === "ar";
  const net = useMetro();
  const [line, setLine] = useState<MetroLineId | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const stations = useMemo(() => (net?.stations ?? []).filter((s) => !line || s.lines.includes(line)), [net, line]);
  const points: MapPoint[] = stations.map((s) => ({
    id: s.id, lat: s.lat, lng: s.lng, category: "station", label: `${stationName(s, ar)} — ${s.lines.map((l) => lineName(l, ar)).join(" · ")}`,
    color: METRO_LINES[line ?? s.lines[0]].color, badge: s.lines.length > 1 ? String(s.lines.length) : undefined,
  }));
  const near = me && net ? nearestStation(net.stations, me) : null;

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <section className="space-y-4" data-testid="metro-panel" aria-labelledby="metro-title">
      <Card className="overflow-hidden">
        <div className="space-y-3 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><TrainIcon className="size-5" /></span>
            <div className="min-w-0">
              <h2 id="metro-title" className="text-lg font-bold">{m.title}</h2>
              <p className="mt-0.5 text-sm text-slate-600">{m.intro}</p>
            </div>
          </div>

          {!net ? (
            <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner />…</p>
          ) : !net.stations.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{m.unavailable}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label={m.title}>
                <LineChip active={!line} onClick={() => setLine(null)}>{m.allLines}</LineChip>
                {METRO_LINE_IDS.map((id) => {
                  const n = net.stations.filter((s) => s.lines.includes(id)).length;
                  if (!n) return null;
                  return (
                    <LineChip key={id} active={line === id} onClick={() => setLine(line === id ? null : id)} color={METRO_LINES[id].color}>
                      {lineName(id, ar)} <span className="opacity-70">· {fmt(m.stations, { n })}</span>
                    </LineChip>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={locate} disabled={locating} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:border-brand-500 disabled:opacity-60" data-testid="metro-locate">
                  {locating ? <Spinner /> : <LocateIcon className="size-4" />}{m.nearestMe}
                </button>
                {near && (
                  <p className="text-sm font-semibold text-slate-800" data-testid="metro-nearest">
                    <LineDots lines={near.station.lines} />{" "}
                    {near.km <= 3
                      ? fmt(m.nearest, { name: stationName(near.station, ar), line: near.station.lines.map((l) => lineName(l, ar)).join("، "), mins: near.walkMins })
                      : fmt(m.nearestFar, { name: stationName(near.station, ar), line: near.station.lines.map((l) => lineName(l, ar)).join("، "), km: near.km.toLocaleString(locale) })}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        {net && net.stations.length > 0 && (
          <GuideMap points={points} selectedId={selected ?? near?.station.id ?? null} onSelect={setSelected} center={RIYADH} fitKey={`${line}`} userLocation={me}
            className="relative h-80 border-t border-slate-200 sm:h-96" unavailableText={m.unavailable} />
        )}
        {net && net.stations.length > 0 && (
          <p className={cx("border-t border-slate-200 px-5 py-2 text-xs", net.source === "sample" ? "bg-amber-50 text-amber-800" : "text-slate-500")} data-testid="metro-source">
            {net.source === "sample" ? m.sample : <>{m.source}{net.fetchedAt ? ` · ${fmt(m.updated, { date: new Date(net.fetchedAt).toLocaleDateString(locale, { timeZone: "Asia/Riyadh" }) })}` : ""}</>}
          </p>
        )}
      </Card>

    </section>
  );
}

function LineChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors", active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500")}>
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

/** Under a Riyadh hotel: the nearest metro station and the walk to it. */
export function HotelMetro({ hotel }: { hotel: { city: string; lat?: number | null; lng?: number | null; nameAr: string; nameEn: string } }) {
  const { t, locale } = useApp();
  const ar = locale === "ar";
  const on = hotel.city === "RUH" && hotel.lat != null && hotel.lng != null;
  const net = useMetro(on);
  const near = on && net?.stations.length ? nearestStation(net.stations, { lat: hotel.lat!, lng: hotel.lng! }) : null;
  if (!near || near.km > 5) return null;
  const lines = near.station.lines.map((l) => lineName(l, ar)).join("، ");
  return (
    <span className="block w-full text-xs text-slate-600" data-testid="hotel-metro" title={fmt(t.metro.nearHotel, { hotel: ar ? hotel.nameAr : hotel.nameEn })}>
      <TrainIcon className="me-1 inline size-3.5 text-brand-700" /><LineDots lines={near.station.lines} />{" "}
      {near.km <= 1.5 ? fmt(t.metro.nearest, { name: stationName(near.station, ar), line: lines, mins: near.walkMins }) : fmt(t.metro.nearestFar, { name: stationName(near.station, ar), line: lines, km: near.km.toLocaleString(locale) })}
      {net?.source === "sample" ? ` · ${t.umrah.sample}` : ""}
    </span>
  );
}

/** Operations: the metro data source and a refresh from the open-data link. */
export function AdminMetroSync() {
  const { t } = useApp();
  const a = t.metro.admin;
  const [info, setInfo] = useState<{ source: "rcrc" | "sample"; fetchedAt: string | null; stations: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/metro", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setInfo).catch(() => undefined);
  }, []);
  async function sync() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/metro", { method: "POST" }).catch(() => null);
    if (r?.ok) {
      const d = await r.json();
      setInfo(d);
      setMsg(fmt(a.done, { n: d.stations }));
    } else setMsg(a.failed);
    setBusy(false);
  }
  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-testid="admin-metro">
      <TrainIcon className="size-5 text-brand-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{a.title}</p>
        {info && <p className="text-xs text-slate-500">{fmt(a.status, { n: info.stations, source: info.source === "sample" ? a.sample : a.rcrc })}{info.fetchedAt ? ` · ${info.fetchedAt.slice(0, 10)}` : ""}</p>}
        {msg && <p className="mt-1 text-xs font-semibold text-slate-700">{msg}</p>}
      </div>
      <button type="button" onClick={() => void sync()} disabled={busy} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {busy && <Spinner />}{a.sync}
      </button>
    </Card>
  );
}
