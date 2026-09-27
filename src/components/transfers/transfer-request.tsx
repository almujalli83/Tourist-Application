"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { ManualInput, TransferPlan } from "@/lib/transfers/transfers";
import { VEHICLE_CAPACITY, type Direction, type PublicTransfer, type TransferQuote, type Vehicle } from "@/lib/transfers/types";
import { useApp } from "../app-provider";
import { CarIcon, PlaneIcon } from "../icons";
import { Alert, Badge, Button, cx, Field, Input, Spinner, Textarea } from "../ui";

export type TransferSource = { bookingId: string; direction: Direction } | { manual: ManualInput };

export const airportName = (code: string, locale: "ar" | "en") => (locale === "ar" ? `مطار ${cityName(code, "ar")}` : `${cityName(code, "en")} airport`);
export const localWhen = (local: string, locale: "ar" | "en") => `${fmtDay(local.slice(0, 10), locale, { weekday: "short", day: "numeric", month: "short" })} · ${local.slice(11, 16)}`;

/** Vehicles and prices from the transfer companies, special needs, then the request. */
export function TransferRequest({ source, onDone, onCancel }: { source: TransferSource; onDone: (t: PublicTransfer) => void; onCancel?: () => void }) {
  const { t, locale, money, user } = useApp();
  const s = t.transfers;
  const [data, setData] = useState<{ plan: TransferPlan; quotes: TransferQuote[]; suggested: Vehicle } | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [extras, setExtras] = useState({ childSeat: false, wheelchair: false, extraBags: 0 });
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState(user?.individual?.phone ?? user?.company?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errText = (code: string) => (s.errors as Record<string, string>)[code] ?? s.errors.generic;

  useEffect(() => {
    let live = true;
    fetch("/api/transfers/options", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(source) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) return setErr(errText(d.error));
        setData(d);
        const best = (d.quotes as TransferQuote[]).find((q) => q.vehicle === d.suggested) ?? d.quotes[0];
        setPick(best?.quoteId ?? null);
      })
      .catch(() => live && setErr(s.errors.generic));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(source)]);

  async function send() {
    const q = data?.quotes.find((x) => x.quoteId === pick);
    if (!q) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/transfers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...source, providerId: q.providerId, quoteId: q.quoteId, extras, notes, phone }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(errText(d.error));
    onDone(d.transfer);
  }

  if (err && !data) return <Alert tone="error"><span data-testid="transfer-error">{err}</span></Alert>;
  if (!data) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const p = data.plan;
  const arrival = p.direction === "arrival";
  return (
    <div className="space-y-4" data-testid="transfer-request">
      <div className="grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <p className="flex items-center gap-2"><PlaneIcon className="size-4 text-brand-700" /><b>{s.flight}:</b> <span dir="ltr">{p.flightNo}</span> · {arrival ? s.landing : s.takeoff} {localWhen(p.flightAt, locale)}</p>
        <p><b>{arrival ? s.from : s.to}:</b> {airportName(p.airport, locale)}</p>
        <p><b>{arrival ? s.to : s.from}:</b> <span dir="auto">{p.place.name}</span></p>
        <p><b>{s.pickup}:</b> {localWhen(p.pickupAt, locale)} · {fmt(s.party, { pax: p.pax, bags: p.bags })}</p>
      </div>
      {data.quotes.length === 0 ? (
        <p className="text-sm text-slate-500">{s.noOffers}</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
          {data.quotes.map((q) => {
            const cap = VEHICLE_CAPACITY[q.vehicle];
            const small = cap.pax < p.pax;
            return (
              <button key={q.quoteId} type="button" disabled={small} aria-pressed={pick === q.quoteId} onClick={() => setPick(q.quoteId)} data-testid="transfer-quote"
                className={cx("rounded-xl p-3 text-start ring-1", pick === q.quoteId ? "bg-brand-50 ring-2 ring-brand-600" : small ? "cursor-not-allowed bg-slate-50 opacity-60 ring-slate-200" : "bg-white ring-slate-200 hover:ring-brand-600")}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-bold"><CarIcon className="size-5 text-brand-700" />{s.vehicles[q.vehicle]}</span>
                  <span className="ltr-nums font-bold text-brand-800">{money(q.priceSAR)}</span>
                </span>
                <span className="mt-1 block text-xs text-slate-500">{fmt(s.capacity, cap)} · {locale === "ar" ? q.providerNameAr : q.providerNameEn}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {q.vehicle === data.suggested && <Badge tone="brand">{s.suggested}</Badge>}
                  {small && <Badge tone="amber">{s.tooSmall}</Badge>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {(() => {
        const q = data.quotes.find((x) => x.quoteId === pick);
        return q ? <p className="text-xs text-slate-500">{arrival ? `${fmt(s.freeWait, { n: q.freeWaitMins })} · ` : ""}{fmt(s.freeCancel, { n: q.freeCancelHours })}</p> : null;
      })()}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">{s.extras.title}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={extras.childSeat} onChange={(e) => setExtras({ ...extras, childSeat: e.target.checked })} className="accent-brand-700" />{s.extras.childSeat}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={extras.wheelchair} onChange={(e) => setExtras({ ...extras, wheelchair: e.target.checked })} className="accent-brand-700" />{s.extras.wheelchair}</label>
          <label className="flex items-center gap-2">{s.extras.extraBags}<Input type="number" min={0} max={10} value={extras.extraBags} onChange={(e) => setExtras({ ...extras, extraBags: Number(e.target.value) })} className="h-8 w-16 text-center" /></label>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={s.phone}><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" /></Field>
        <Field label={s.notes}><Textarea rows={2} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} dir="auto" /></Field>
      </div>
      <p className="text-xs text-slate-500">{s.payNote}</p>
      {data.quotes.some((q) => q.sandbox) && <p className="text-xs font-semibold text-amber-700">{s.sandbox}</p>}
      {err && <Alert tone="error"><span data-testid="transfer-error">{err}</span></Alert>}
      <div className="flex flex-wrap gap-2">
        <Button loading={busy} disabled={!pick} onClick={send} data-testid="transfer-send">{s.send}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t.common.cancel}</Button>}
      </div>
    </div>
  );
}
