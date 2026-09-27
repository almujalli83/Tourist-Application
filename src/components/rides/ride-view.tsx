"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { LIVE_RIDE, type PublicRide, type RideStatus } from "@/lib/rides/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { GuideMap, type MapPoint } from "../guide/guide-map";
import { CarIcon, PhoneIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Spinner } from "../ui";

const STEPS: RideStatus[] = ["searching", "arriving", "in_progress", "completed"];
const stepOf = (s: RideStatus) => (s === "accepted" ? 1 : Math.max(0, STEPS.indexOf(s)));

/** A ride ordered in the platform: status, driver, live position on the map, fare, cancel. */
export function RideView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const r = t.rides;
  const ar = locale === "ar";
  const [ride, setRide] = useState<PublicRide | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/rides/${id}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).then((d) => setRide(d?.ride ?? "missing")).catch(() => undefined);
  }, [id]);
  useEffect(load, [load]);
  const live = ride && ride !== "missing" && LIVE_RIDE.includes(ride.status);
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [live, load]);
  if (ride === "missing") return <Alert tone="error">{r.rideErrors.generic}</Alert>;
  if (!ride) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const x = ride;
  const points: MapPoint[] = [
    { id: "pickup", lat: x.pickup.lat, lng: x.pickup.lng, category: "landmark", label: `${r.pickup}: ${x.pickup.name}`, badge: "A" },
    { id: "dropoff", lat: x.dropoff.lat, lng: x.dropoff.lng, category: "restaurant", label: `${r.dropoff}: ${x.dropoff.name}`, badge: "B" },
    ...(x.driverAt ? [{ id: "driver", lat: x.driverAt.lat, lng: x.driverAt.lng, category: "station" as const, label: x.driver?.name ?? r.driverLabel, color: x.color }] : []),
  ];
  async function cancel() {
    if (!confirm(r.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/rides/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr((r.rideErrors as Record<string, string>)[d.error] ?? r.rideErrors.generic);
    setRide(d.ride);
  }
  const eta = x.status === "in_progress" ? (x.etaMins ? fmt(r.etaDrop, { n: x.etaMins }) : null)
    : x.status === "accepted" || x.status === "arriving" ? (x.etaMins ? fmt(r.etaPickup, { n: x.etaMins }) : r.atPickup) : null;
  return (
    <div className="space-y-4" data-testid="ride-view">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><CarIcon className="size-6 text-brand-700" />{fmt(r.rideTitle, { company: ar ? x.providerNameAr : x.providerNameEn })}</h1>
        <Badge tone={x.status === "completed" ? "slate" : LIVE_RIDE.includes(x.status) ? "brand" : "red"}><span data-testid="ride-status">{r.status[x.status]}</span></Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card className="relative h-80 overflow-hidden lg:h-auto lg:min-h-[28rem]">
          <GuideMap points={points} selectedId="driver" center={{ lat: x.pickup.lat, lng: x.pickup.lng, zoom: 13 }} fitKey={x.status === "in_progress" ? "trip" : "pickup"} className="absolute inset-0" unavailableText="" />
        </Card>
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            {LIVE_RIDE.includes(x.status) || x.status === "completed" ? (
              <ol className="flex items-center gap-1" aria-hidden>
                {STEPS.map((s, i) => <li key={s} className={cx("h-1.5 flex-1 rounded-full", i <= stepOf(x.status) ? "bg-brand-600" : "bg-slate-200")} />)}
              </ol>
            ) : null}
            <p className="text-lg font-bold">{r.status[x.status]}</p>
            {eta && <p className="text-sm font-semibold text-brand-800" data-testid="ride-eta">{eta}</p>}
            <p className="text-sm text-slate-600"><b>{r.pickup}:</b> {x.pickup.name}<br /><b>{r.dropoff}:</b> <span dir="auto">{x.dropoff.name}</span></p>
            <p className="text-sm">{x.product} · {r.categories[x.category]}</p>
          </Card>
          {x.driver && (
            <Card className="flex items-center gap-3 p-5" data-testid="ride-driver">
              <span className="grid size-11 place-items-center rounded-full text-lg font-bold text-white" style={{ background: x.color }}>{x.driver.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold">{x.driver.name}{x.driver.rating ? <span className="ms-2 text-xs font-normal text-slate-500">★ {x.driver.rating}</span> : null}</p>
                <p className="text-slate-600">{x.driver.car}</p>
                <p className="font-mono text-slate-800">{x.driver.plate}</p>
              </div>
              {x.driver.phone && LIVE_RIDE.includes(x.status) && <a href={`tel:${x.driver.phone}`} className="inline-flex h-10 items-center gap-1 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white"><PhoneIcon className="size-4" />{r.call}</a>}
            </Card>
          )}
          <Card className="p-5 text-sm">
            <p className="text-xs font-semibold text-slate-500">{r.fare}</p>
            {x.fareSAR != null ? <p className="ltr-nums text-lg font-bold text-brand-800" data-testid="ride-fare">{money(x.fareSAR)}</p> : <p>{fmt(r.fareRange, { min: x.minSAR, max: x.maxSAR })}</p>}
            <p className="mt-1 text-xs text-slate-500">{r.payNote}</p>
            {x.sandbox && <p className="mt-2 text-xs font-semibold text-amber-700">{r.sample}</p>}
          </Card>
          {err && <Alert tone="error">{err}</Alert>}
          {["searching", "accepted", "arriving"].includes(x.status) && <Button variant="danger" className="w-full" loading={busy} onClick={() => void cancel()} data-testid="ride-cancel">{r.cancel}</Button>}
        </div>
      </div>
    </div>
  );
}
