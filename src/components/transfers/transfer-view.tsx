"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { PublicTransfer } from "@/lib/transfers/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { ContactButtons } from "../guides/guide-card";
import { CarIcon, PlaneIcon } from "../icons";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { airportName, localWhen } from "./transfer-request";
import { TRANSFER_TONE } from "./transfers-section";

export function TransferView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const s = t.transfers;
  const [tr, setTr] = useState<PublicTransfer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/transfers/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { transfer: null })).then((d) => setTr(d.transfer)).catch(() => setTr(null));
  }, [id]);
  useEffect(load, [load]);
  if (tr === undefined) return <div className="grid h-60 place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  if (!tr) return <Alert tone="error">{s.errors.generic}</Alert>;
  const arrival = tr.direction === "arrival";
  const live = tr.status === "requested" || tr.status === "confirmed";
  async function cancel() {
    if (!confirm(s.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/transfers/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
    load();
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="transfer-view">
      <BackLink href={tr.bookingId ? `/${locale}/account/bookings/${tr.bookingId}#transfers` : `/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{fmt(s.detailTitle, { dir: s.direction[tr.direction], ref: tr.reference })}</h1>
        <span data-testid="transfer-status"><Badge tone={TRANSFER_TONE[tr.status]}>{s.status[tr.status]}</Badge></span>
      </div>
      {tr.cancelReason && <Alert tone="warning">{s.cancelReason[tr.cancelReason]}</Alert>}
      <Card className="space-y-3 p-5" data-testid="transfer-driver">
        <p className="flex items-center gap-2 font-bold"><CarIcon className="size-5 text-brand-700" />{s.driver}</p>
        {tr.driver ? (
          <>
            <p className="text-lg font-bold">{tr.driver.name}</p>
            <p className="text-sm text-slate-600">{tr.driver.car} · <span dir="auto">{tr.driver.plate}</span></p>
            {live && <ContactButtons phone={tr.driver.phone} />}
          </>
        ) : (
          <p className="text-sm text-slate-600">{s.driverPending}</p>
        )}
      </Card>
      <Card className="space-y-2 p-5 text-sm">
        <p className="flex items-center gap-2"><PlaneIcon className="size-4 text-brand-700" /><b>{s.flight}:</b> <span dir="ltr">{tr.flightNo}</span> · {arrival ? s.landing : s.takeoff} {localWhen(tr.flightAt, locale)}</p>
        <p><b>{arrival ? s.from : s.to}:</b> {airportName(tr.airport, locale)}</p>
        <p><b>{arrival ? s.to : s.from}:</b> <span dir="auto">{tr.place.name}</span></p>
        <p><b>{s.pickup}:</b> {localWhen(tr.pickupAt, locale)} · {fmt(s.party, { pax: tr.pax, bags: tr.bags })} · {s.vehicles[tr.vehicle]}</p>
        {(tr.extras.childSeat || tr.extras.wheelchair || tr.extras.extraBags > 0) && (
          <p><b>{s.extras.title}:</b> {[tr.extras.childSeat && s.extras.childSeat, tr.extras.wheelchair && s.extras.wheelchair, tr.extras.extraBags > 0 && `${s.extras.extraBags} ×${tr.extras.extraBags}`].filter(Boolean).join(" · ")}</p>
        )}
        {tr.notes && <p className="text-slate-600" dir="auto">{tr.notes}</p>}
        <p><b>{s.price}:</b> <span className="ltr-nums">{money(tr.priceSAR)}</span></p>
        <p><b>{s.company}:</b> {locale === "ar" ? tr.providerNameAr : tr.providerNameEn} · <span dir="ltr" className="ltr-nums">{tr.providerRef}</span></p>
        <p className="text-xs text-slate-500">{arrival ? `${fmt(s.freeWait, { n: tr.freeWaitMins })} · ` : ""}{fmt(s.freeCancel, { n: tr.freeCancelHours })}</p>
        {tr.sandbox && <p className="text-xs font-semibold text-amber-700">{s.sandbox}</p>}
      </Card>
      {err && <Alert tone="error">{err}</Alert>}
      {live && <Button variant="secondary" loading={busy} onClick={cancel} data-testid="transfer-cancel">{s.cancel}</Button>}
    </div>
  );
}
