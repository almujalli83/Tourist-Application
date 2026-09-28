"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { directionsLinks } from "@/lib/guide/geo";
import type { RideOption, RidePoint } from "@/lib/rides/types";
import type { RideDestination, RideEstimate } from "@/lib/transport/rides";
import { useApp } from "../app-provider";
import { CarIcon, DirectionsIcon, XIcon } from "../icons";
import { PhoneInput } from "../phone-input";
import { Alert, Button, cx, Field, Spinner } from "../ui";

/** Approximate fare range and time, labelled as an estimate. */
export function RideEstimateText({ e, className }: { e: RideEstimate; className?: string }) {
  const { t } = useApp();
  return <span className={className} data-testid="ride-estimate">{fmt(t.rides.estimate, { min: e.minSAR, max: e.maxSAR, mins: e.mins })}</span>;
}

/** «Order a car»: opens the ride request inside the platform (companies, prices, then live tracking). */
export function RideMenu({ to, from, estimate, size = "sm", light, className }: { to: RideDestination; from?: { lat: number; lng: number } | null; estimate?: RideEstimate | null; size?: "sm" | "md"; light?: boolean; className?: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("relative inline-block", className)} data-testid="ride-menu">
      <button type="button" onClick={() => setOpen(true)}
        className={cx("inline-flex items-center gap-1.5 rounded-lg font-semibold", light ? "bg-white text-ink hover:bg-slate-100" : "bg-ink text-white hover:bg-ink/90", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm")} data-testid="ride-open">
        <CarIcon className="size-4" />{t.rides.order}
      </button>
      {open && <RideSheet to={to} from={from ?? null} estimate={estimate ?? null} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RideSheet({ to, from, estimate, onClose }: { to: RideDestination; from: { lat: number; lng: number } | null; estimate: RideEstimate | null; onClose: () => void }) {
  const { t, locale, user } = useApp();
  const r = t.rides;
  const ar = locale === "ar";
  const router = useRouter();
  const [pickup, setPickup] = useState<RidePoint | null>(from ? { name: r.myLocation, ...from } : null);
  const [denied, setDenied] = useState(false);
  const [options, setOptions] = useState<RideOption[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [phone, setPhone] = useState(user?.individual?.phone ?? user?.company?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errText = (c?: string) => (r.rideErrors as Record<string, string>)[c ?? ""] ?? r.rideErrors.generic;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => {
    if (pickup) return;
    if (!navigator.geolocation) return setDenied(true);
    navigator.geolocation.getCurrentPosition((p) => setPickup({ name: r.myLocation, lat: p.coords.latitude, lng: p.coords.longitude }), () => setDenied(true), { timeout: 10_000, maximumAge: 120_000 });
  }, [pickup, r.myLocation]);
  useEffect(() => {
    if (!pickup) return;
    setOptions(null);
    fetch("/api/rides/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pickup, dropoff: to }) })
      .then(async (x) => {
        const d = await x.json().catch(() => ({}));
        if (!x.ok) return setErr(errText(d.error));
        setOptions(d.options);
        setPick((d.options as RideOption[])[0]?.optionId ?? null);
      })
      .catch(() => setErr(errText()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, to.lat, to.lng]);

  async function order() {
    const o = options?.find((x) => x.optionId === pick);
    if (!o || !pickup) return;
    setBusy(true);
    setErr(null);
    const x = await fetch("/api/rides", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId: o.providerId, optionId: o.optionId, pickup, dropoff: to, phone }) }).catch(() => null);
    const d = await x?.json().catch(() => ({}));
    setBusy(false);
    if (!x?.ok) return setErr(errText(d?.error));
    router.push(`/${locale}/account/rides/${d.ride.id}`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={fmt(r.sheetTitle, { place: to.name })} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-start text-sm text-ink shadow-xl sm:rounded-2xl" data-testid="ride-sheet">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{fmt(r.sheetTitle, { place: to.name })}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100" aria-label={t.common.cancel}><XIcon className="size-5" /></button>
        </div>
        <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
          <p><b>{r.pickup}:</b> {pickup ? r.myLocation : denied ? <span className="text-amber-700">{r.locationDenied}</span> : <span className="text-slate-500">{r.locating}</span>}</p>
          <p><b>{r.dropoff}:</b> <span dir="auto">{to.name}</span></p>
          {estimate && <p className="text-xs text-slate-500"><RideEstimateText e={estimate} /></p>}
        </div>
        {pickup && !options && !err && <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>}
        {options && (options.length === 0 ? <p className="mt-3 text-slate-500">{r.noOptions}</p> : (
          <ul className="mt-3 space-y-2" role="radiogroup">
            {options.map((o) => (
              <li key={o.optionId}>
                <button type="button" role="radio" aria-checked={pick === o.optionId} onClick={() => setPick(o.optionId)} data-testid="ride-option"
                  className={cx("flex w-full items-center gap-3 rounded-xl p-3 text-start ring-1", pick === o.optionId ? "bg-brand-50 ring-2 ring-brand-600" : "ring-slate-200 hover:ring-brand-600")}>
                  <span className="inline-flex h-7 min-w-16 items-center justify-center rounded-md px-2 text-xs font-extrabold text-white" style={{ background: o.color }}>{ar ? o.providerNameAr : o.providerNameEn}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{o.product} · {r.categories[o.category]}</span>
                    <span className="block text-xs text-slate-500">{fmt(r.seats, { n: o.seats })} · {fmt(r.arrivesIn, { n: o.etaMins })}</span>
                  </span>
                  <span className="ltr-nums font-bold text-brand-800">{o.minSAR === o.maxSAR ? o.minSAR : `${o.minSAR}–${o.maxSAR}`} {ar ? "ر.س" : "SAR"}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
        {options?.some((o) => o.sandbox) && <p className="mt-2 text-xs font-semibold text-amber-700">{r.sample}</p>}
        {options && options.length > 0 && (user ? (
          <div className="mt-4 space-y-3">
            <Field label={r.phone}><PhoneInput value={phone} onChange={setPhone} defaultCountry={user?.individual?.nationality || "SA"} testId="ride-phone" /></Field>
            <p className="text-xs text-slate-500">{r.payNote}</p>
            <Button className="w-full" loading={busy} disabled={!pick} onClick={() => void order()} data-testid="ride-request"><CarIcon className="size-4" />{r.request}</Button>
          </div>
        ) : (
          <Link href={`/${locale}/login`} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white">{r.signIn}</Link>
        ))}
        {err && <Alert tone="error" className="mt-3"><span data-testid="ride-error">{err}</span></Alert>}
        <a href={directionsLinks(to).google} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline">
          <DirectionsIcon className="size-3.5" />{r.directions}
        </a>
      </div>
    </div>
  );
}
