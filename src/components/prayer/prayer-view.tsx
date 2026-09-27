"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName, MAKKAH, SAUDI_CITIES } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import { CITY_CENTERS } from "@/lib/guide/centers";
import { directionsLinks } from "@/lib/guide/geo";
import type { Mosque } from "@/lib/prayer/mosques";
import { hijriDate, isFriday, ksaNow, nextPrayer, PRAYERS, prayerTimes, qiblaBearing, type PrayerName } from "@/lib/prayer/times";
import type { TripCity } from "@/lib/prayer/trip";
import { useApp } from "../app-provider";
import { ClockIcon, DirectionsIcon, LocateIcon, MapPinIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Select, Spinner } from "../ui";
import { TEST_ALERT } from "./prayer-alerts";
import { usePrayerSettings, useNow } from "./settings";

const addDay = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function useCountdown(inMin: number) {
  const { t } = useApp();
  const h = Math.floor(inMin / 60);
  return h ? fmt(t.prayer.inTime, { h, m: inMin % 60 }) : fmt(t.prayer.inMinutes, { m: inMin });
}

/** Qibla compass: the device heading when a compass is available, otherwise the angle from north. */
function Qibla({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useApp();
  const p = t.prayer;
  const bearing = qiblaBearing(lat, lng);
  const [heading, setHeading] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "on" | "none">("idle");

  async function start() {
    const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }) | undefined;
    if (!DOE) return setState("none");
    if (typeof DOE.requestPermission === "function" && (await DOE.requestPermission().catch(() => "denied")) !== "granted") return setState("none");
    let got = false;
    const onEvent = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
      const h = typeof e.webkitCompassHeading === "number" ? e.webkitCompassHeading : e.absolute && e.alpha !== null ? 360 - e.alpha : null;
      if (h === null) return;
      got = true;
      setHeading(h);
    };
    window.addEventListener("deviceorientationabsolute" as "deviceorientation", onEvent);
    window.addEventListener("deviceorientation", onEvent);
    setState("on");
    setTimeout(() => !got && setState("none"), 3000);
  }

  const rotation = heading === null ? bearing : bearing - heading;
  const aligned = heading !== null && Math.abs(((rotation % 360) + 540) % 360 - 180) < 5;
  return (
    <Card className="p-5" data-testid="qibla">
      <h2 className="font-bold">{p.qibla}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <div className={cx("relative grid size-40 shrink-0 place-items-center rounded-full border-4 bg-white", aligned ? "border-brand-600" : "border-slate-200")}>
          {heading === null && <span className="absolute top-1 text-xs font-bold text-red-600">N</span>}
          <div className="absolute inset-0 transition-transform duration-300" style={{ transform: `rotate(${rotation}deg)` }} aria-hidden>
            <div className="absolute start-1/2 top-3 h-14 w-1 -translate-x-1/2 rounded-full bg-brand-700 rtl:translate-x-1/2" />
            <div className="absolute start-1/2 top-0 grid size-6 -translate-x-1/2 place-items-center rounded bg-ink text-[9px] text-gold-500 rtl:translate-x-1/2">■</div>
          </div>
          <span className="size-3 rounded-full bg-brand-800" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="text-2xl font-bold text-ink ltr-nums" data-testid="qibla-bearing">{bearing.toFixed(0)}°</p>
          <p className="text-slate-600">{fmt(p.qiblaDeg, { d: bearing.toFixed(0) })}</p>
          {state === "idle" && <Button size="sm" variant="secondary" onClick={start}>{p.qiblaStart}</Button>}
          {state === "on" && <p className="text-xs text-slate-500">{aligned ? <b className="text-brand-700">{p.qiblaAligned}</b> : p.qiblaHint}</p>}
          {state === "none" && <p className="text-xs text-slate-500">{p.qiblaNoSensor}</p>}
        </div>
      </div>
    </Card>
  );
}

function MosqueList({ mosques, title }: { mosques: Mosque[]; title: string }) {
  const { t, locale } = useApp();
  const p = t.prayer;
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{title}</p>
      <ul className="divide-y divide-slate-100">
        {mosques.map((m) => {
          const name = (locale === "ar" ? m.nameAr ?? m.nameEn : m.nameEn ?? m.nameAr) ?? p.unnamed;
          const links = directionsLinks(m);
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5" data-testid="mosque">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{name}</p>
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="ltr-nums">{fmt(p.km, { d: m.km < 1 ? m.km.toFixed(2) : m.km.toFixed(1) })}</span>
                  {m.jami && <Badge tone="brand">{p.jami}</Badge>}
                </p>
              </div>
              <a href={links.google} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-100">
                <DirectionsIcon className="size-4" />{p.directions}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Service 11 — prayer times (optional). */
export function PrayerView() {
  const { t, locale } = useApp();
  const p = t.prayer;
  const [settings, update, ready] = usePrayerSettings();
  const now = useNow(20_000);
  const [loc, setLoc] = useState<{ lat: number; lng: number; city: string | null; label: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "noTrip">("idle");
  const [mosques, setMosques] = useState<Mosque[] | null>(null);
  const [notify, setNotify] = useState<NotificationPermission | "unsupported">("default");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNotify(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  // Resolve the location from the chosen source.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const set = (l: { lat: number; lng: number; city: string | null; label: string }) => {
      if (!alive) return;
      setLoc(l);
      setStatus("idle");
      update({ loc: { lat: l.lat, lng: l.lng, city: l.city } });
    };
    if (settings.source === "city") {
      const c = CITY_CENTERS[settings.city] ?? CITY_CENTERS.RUH;
      set({ lat: c.lat, lng: c.lng, city: settings.city, label: cityName(settings.city, locale) });
    } else if (settings.source === "trip") {
      setStatus("locating");
      fetch("/api/prayer/trip")
        .then((r) => r.json())
        .then(({ trip }: { trip: TripCity | null }) => {
          if (!alive) return;
          if (!trip) return setStatus("noTrip");
          set({ lat: trip.lat, lng: trip.lng, city: trip.city, label: `${cityName(trip.city, locale)} · ${fmt(trip.demo ? p.sampleTrip : p.tripOf, { ref: trip.reference })}` });
        })
        .catch(() => alive && setStatus("noTrip"));
    } else {
      if (!navigator.geolocation) {
        setStatus("denied");
        return;
      }
      setStatus("locating");
      navigator.geolocation.getCurrentPosition(
        (pos) => set({ lat: pos.coords.latitude, lng: pos.coords.longitude, city: null, label: p.nearLocation }),
        () => alive && setStatus("denied"),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
      );
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, settings.source, settings.city, locale]);

  useEffect(() => {
    if (!loc) return;
    setMosques(null);
    fetch(`/api/prayer/mosques?lat=${loc.lat.toFixed(4)}&lng=${loc.lng.toFixed(4)}`)
      .then((r) => (r.ok ? r.json() : { mosques: [] }))
      .then((d) => setMosques(d.mosques))
      .catch(() => setMosques([]));
  }, [loc]);

  const { day, min } = ksaNow(now);
  const times = useMemo(() => (loc ? prayerTimes(day, loc.lat, loc.lng) : null), [loc, day]);
  const next = loc ? nextPrayer(day, min, loc.lat, loc.lng) : null;
  const countdown = useCountdown(next?.inMin ?? 0);
  const friday = isFriday(day);
  const label = (n: PrayerName, d: string) => (n === "dhuhr" && isFriday(d) ? p.names.jumuah : p.names[n]);
  const week = useMemo(() => (loc ? Array.from({ length: 7 }, (_, i) => addDay(day, i)).map((d) => ({ d, times: prayerTimes(d, loc.lat, loc.lng) })) : []), [loc, day]);

  async function allowNotify() {
    if (typeof Notification === "undefined") return;
    setNotify(await Notification.requestPermission());
  }
  const save = (patch: Parameters<typeof update>[0]) => {
    update(patch);
    setSaved(true);
  };

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{p.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{p.intro}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={p.city}>
        {(["gps", "trip", "city"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={settings.source === k} onClick={() => update({ source: k })} data-testid={`source-${k}`}
            className={cx("inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold", settings.source === k ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
            {k === "gps" ? <LocateIcon className="size-4" /> : <MapPinIcon className="size-4" />}{p.source[k]}
          </button>
        ))}
        {settings.source === "city" && (
          <div className="w-48">
            <Select value={settings.city} onChange={(e) => update({ city: e.target.value })} className="h-9" aria-label={p.city} data-testid="city-select">
              {[MAKKAH, ...SAUDI_CITIES].filter((c) => CITY_CENTERS[c.code]).map((c) => <option key={c.code} value={c.code}>{locale === "ar" ? c.ar : c.en}</option>)}
            </Select>
          </div>
        )}
      </div>

      {status === "locating" && <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="size-4" />{p.locating}</p>}
      {status === "denied" && <Alert tone="warning">{p.gpsDenied}</Alert>}
      {status === "noTrip" && <Alert tone="info">{p.noTrip}</Alert>}

      {loc && times && next && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-2xl bg-brand-900 p-6 text-white" data-testid="next-prayer">
              <p className="flex items-center gap-1.5 text-xs text-brand-100"><MapPinIcon className="size-3.5" />{loc.label}</p>
              <p className="mt-3 text-sm text-brand-100">{p.next}</p>
              <p className="mt-1 text-4xl font-bold">{label(next.name, next.day)} <span className="ltr-nums">{next.time}</span></p>
              <p className="mt-1 flex items-center gap-1.5 text-gold-100"><ClockIcon className="size-4" />{countdown}</p>
              <p className="mt-4 text-xs text-brand-100">{fmtDay(day, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {hijriDate(day, locale)}</p>
            </div>
            <Card className="p-5">
              <h2 className="mb-2 font-bold">{p.today}</h2>
              <ul className="divide-y divide-slate-100" data-testid="today-times">
                {PRAYERS.map((n) => (
                  <li key={n} className={cx("flex items-center justify-between py-2 text-sm", next.day === day && next.name === n && "font-bold text-brand-800", n === "sunrise" && "text-slate-500")} data-testid={`time-${n}`}>
                    <span>{label(n, day)}</span>
                    <span className="ltr-nums">{times[n]}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          {friday && <Alert tone="info">{p.fridayNote}</Alert>}

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <Qibla lat={loc.lat} lng={loc.lng} />
            <Card className="space-y-4 p-5" data-testid="mosques">
              <h2 className="font-bold">{p.mosques}</h2>
              {!mosques ? (
                <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
              ) : mosques.length === 0 ? (
                <p className="text-sm text-slate-500">{p.noMosques}</p>
              ) : (
                <>
                  {friday && mosques.some((m) => m.jami) && <MosqueList mosques={mosques.filter((m) => m.jami).slice(0, 3)} title={p.fridayMosques} />}
                  <MosqueList mosques={mosques.slice(0, 6)} title={friday ? p.mosques : ""} />
                </>
              )}
              <p className="text-xs text-slate-400">{p.mosquesSource}</p>
            </Card>
          </div>

          <Card className="overflow-x-auto p-5">
            <h2 className="mb-3 font-bold">{p.week}</h2>
            <table className="w-full min-w-[560px] text-sm" data-testid="week">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="py-2 text-start font-semibold">{p.day}</th>
                  {PRAYERS.map((n) => <th key={n} className="py-2 text-center font-semibold">{p.names[n]}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {week.map((w) => (
                  <tr key={w.d} className={cx(w.d === day && "bg-brand-50/60 font-semibold")}>
                    <td className="py-2">{fmtDay(w.d, locale, { weekday: "short", day: "numeric", month: "short" })}</td>
                    {PRAYERS.map((n) => <td key={n} className={cx("ltr-nums py-2 text-center", n === "dhuhr" && isFriday(w.d) && "text-brand-800")}>{w.times[n]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Card className="space-y-4 p-5" data-testid="prayer-settings">
        <h2 className="font-bold">{p.settings}</h2>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="size-4 accent-brand-700" checked={settings.showHome} onChange={(e) => save({ showHome: e.target.checked })} data-testid="show-home" />
          {p.showHome}
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{p.alert}</span>
          <div className="w-44">
            <Select value={String(settings.alertMins)} onChange={(e) => save({ alertMins: Number(e.target.value) })} className="h-9" aria-label={p.alert} data-testid="alert-mins">
              <option value="0">{p.alertOff}</option>
              {[5, 10, 15, 30].map((m) => <option key={m} value={m}>{fmt(p.alertMin, { m })}</option>)}
            </Select>
          </div>
          <Button size="sm" variant="ghost" onClick={() => window.dispatchEvent(new Event(TEST_ALERT))} data-testid="test-alert">{p.testAlert}</Button>
        </div>
        {settings.alertMins > 0 && notify !== "unsupported" && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">{p.alertNotify}</p>
            <p className="mt-1">{p.alertNotifyHint}</p>
            {notify === "granted" ? <p className="mt-2 font-semibold text-brand-700">{p.notifyOn}</p> : notify === "denied" ? <p className="mt-2 text-red-700">{p.notifyBlocked}</p> : <Button size="sm" variant="secondary" className="mt-2" onClick={allowNotify}>{p.allowNotify}</Button>}
          </div>
        )}
        {saved && <p className="text-xs text-brand-700">{p.saved}</p>}
      </Card>

      <p className="text-xs text-slate-500">{p.method}</p>
    </div>
  );
}
