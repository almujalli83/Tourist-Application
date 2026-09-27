"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { countryName } from "@/lib/data/countries";
import type { LicenceRule } from "@/lib/rentals/licence";
import type { CompanyBrand } from "@/lib/rentals/rentals";
import type { PublicRental, RentalQuery } from "@/lib/rentals/types";
import { localWhen } from "../transfers/transfer-request";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { CarIcon, PhoneIcon } from "../icons";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { RENTAL_TONE } from "./rental-panel";
import { DrivingTips, LicenceBox } from "./rental-search";
import { CompanyBadge } from "./company-badge";

/** A car rental: status, confirmation and counter, dates, price, what to bring, cancellation. */
export function RentalView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const r = t.rentals;
  const ar = locale === "ar";
  const [data, setData] = useState<{ rental: PublicRental; company: CompanyBrand | null; licence: LicenceRule | null; reviewed: boolean; sourceUrl: string } | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/rentals/${id}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : "missing")).then(setData).catch(() => setData("missing"));
  }, [id]);
  if (data === "missing") return <Alert tone="error">{r.errors.generic}</Alert>;
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const x = data.rental;
  const spot = (q: RentalQuery, back: boolean) => {
    const [c, s] = back ? [q.dropoffCity, q.dropoffSpot] : [q.city, q.pickupSpot];
    return `${r.spots[s]} — ${cityName(c, locale)}`;
  };
  const live = x.status === "requested" || x.status === "confirmed";
  async function cancel() {
    if (!confirm(r.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/rentals/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr((r.errors as Record<string, string>)[d.error] ?? r.errors.generic);
    setData((o) => (o && o !== "missing" ? { ...o, rental: d.rental } : o));
  }
  return (
    <div className="space-y-5" data-testid="rental-view">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><CarIcon className="size-6 text-brand-700" />{fmt(r.detailTitle, { ref: x.reference })}</h1>
        <Badge tone={RENTAL_TONE[x.status]}><span data-testid="rental-status">{r.status[x.status]}</span></Badge>
      </div>
      {x.cancelReason && <Alert tone="warning">{r.cancelReason[x.cancelReason]}</Alert>}
      <Card className="grid gap-4 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.company}</p>
          <p className="mt-1 flex items-center gap-2 font-semibold"><CompanyBadge brand={data.company} fallback={ar ? x.providerNameAr : x.providerNameEn} />{data.company?.logo ? (ar ? x.providerNameAr : x.providerNameEn) : null}</p>
          <p className="mt-1 text-sm">{r.classes[x.carClass]} · <span dir="auto">{fmt(r.orSimilar, { model: x.model })}</span></p>
          <p className="text-xs text-slate-500">{x.automatic ? r.automatic : r.manual} · {x.kmPerDay ? fmt(r.kmPerDay, { n: x.kmPerDay }) : r.unlimitedKm}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.confirmation}</p>
          {x.confirmation ? <p className="ltr-nums text-lg font-bold" data-testid="rental-confirmation">{x.confirmation}</p> : <p className="text-sm text-slate-600">{r.counterPending}</p>}
          {x.counter && (
            <p className="mt-1 text-sm" data-testid="rental-counter">
              {r.counter}: {x.counter.name} — <span dir="auto">{x.counter.address}</span>
              {x.counter.phone && <a href={`tel:${x.counter.phone}`} className="ms-2 inline-flex items-center gap-1 font-semibold text-brand-700"><PhoneIcon className="size-3.5" /><span dir="ltr">{x.counter.phone}</span></a>}
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.pickup}</p>
          <p className="text-sm font-semibold">{localWhen(x.pickupAt, locale)}</p>
          <p className="text-sm text-slate-600">{spot(x, false)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.return}</p>
          <p className="text-sm font-semibold">{localWhen(x.returnAt, locale)}</p>
          <p className="text-sm text-slate-600">{spot(x, true)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.driver}</p>
          <p className="text-sm" dir="auto">{x.driverName}</p>
          <p className="text-xs text-slate-500">{r.licenceCountry}: {countryName(x.licenceCountry, locale)} · {r.driverAge}: {x.driverAge}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-500">{r.grandTotal}</p>
          <p className="ltr-nums text-lg font-bold text-brand-800">{money(x.totalSAR)}</p>
          <p className="text-xs text-slate-500">{fmt(r.total, { amount: money(x.totalSAR), days: x.days })}{x.extras.length ? ` · ${x.extras.map((e) => r.extras[e]).join("، ")}` : ""}</p>
          <p className="text-xs text-slate-500">{fmt(r.deposit, { amount: money(x.depositSAR) })} · {fmt(r.freeCancel, { n: x.freeCancelHours })}</p>
        </div>
      </Card>
      {x.sandbox && <p className="text-xs font-semibold text-amber-700">{r.sandbox}</p>}
      {live && <LicenceBox licence={data.licence} reviewed={data.reviewed} sourceUrl={data.sourceUrl} />}
      {err && <Alert tone="error">{err}</Alert>}
      {live && <Button variant="danger" loading={busy} onClick={cancel} data-testid="rental-cancel">{r.cancel}</Button>}
      <DrivingTips />
    </div>
  );
}
