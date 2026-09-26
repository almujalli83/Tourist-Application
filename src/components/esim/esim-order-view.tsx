"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import type { EsimOrder } from "@/lib/esim/orders";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { PhoneIcon } from "../icons";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

interface View { order: EsimOrder; qr: Record<string, string>; canCancel: boolean }

/** An eSIM order: one installation QR code per traveller, install steps and refund before activation. */
export function EsimOrderView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const e = t.esim;
  const o_ = e.order;
  const [data, setData] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/esim/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) setMissing(true);
    else setData(await r.json());
  }, [id]);
  useEffect(() => {
    setFresh(new URLSearchParams(window.location.search).has("new"));
    void load();
  }, [load]);

  if (missing) return <Alert tone="error">{e.errors.generic}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const o = data.order;
  const cancelled = o.status === "CANCELLED";
  const size = o.plan.dataGB === null ? e.unlimited : fmt(e.dataGB, { n: o.plan.dataGB });

  async function cancel() {
    if (!confirm(o_.confirmCancel)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/esim/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setErr((e.errors as Record<string, string>)[body.error] ?? e.errors.generic);
      setFresh(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden"><BackLink href={`/${locale}/account`} label={t.nav.myBookings} /></div>
      {fresh && !cancelled && <Alert tone="success" className="print:hidden">{o_.purchased}</Alert>}
      {cancelled && o.cancellation && <Alert tone="warning">{fmt(o_.cancelled, { amount: money(o.cancellation.refundSAR) })}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-700">Tygo · {e.kinds[o.plan.kind]}</p>
            <h1 className="mt-1 text-2xl font-bold">{size} · {fmt(e.days, { n: o.plan.days })}</h1>
            {o.plan.minutes > 0 && <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><PhoneIcon className="size-4" />{e.localNumber} · {fmt(e.minutes, { n: o.plan.minutes })}</p>}
          </div>
          <Badge tone={cancelled ? "red" : "brand"}>{o_.status[o.status]}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">{o_.reference}</dt><dd className="ltr-nums font-bold">{o.reference} · {o.orderRef}</dd></div>
          <div><dt className="text-xs text-slate-500">{t.common.total}</dt><dd className="font-semibold">{money(o.totalSAR)} · {o.payment.method.toUpperCase()} •••{o.payment.last4}</dd></div>
          <div><dt className="text-xs text-slate-500">{fmtKsa(o.createdAt, locale, { day: "numeric", month: "long", year: "numeric" })}</dt><dd className="font-semibold">{o.booking ? fmt(o_.withPackage, { ref: o.booking.reference }) : "—"}</dd></div>
        </dl>
        {!cancelled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 print:hidden">
            <PrintButton label={o_.print} />
            {data.canCancel && <Button variant="danger" onClick={cancel} loading={busy}>{o_.cancel}</Button>}
            <span className="text-xs text-slate-500">{o.plan.refundableBeforeActivation ? o_.cancelNote : o_.finalNote}</span>
          </div>
        )}
      </Card>

      {!cancelled && (
        <>
          <Card className="p-5">
            <h2 className="font-bold">{o_.install}</h2>
            <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-slate-700">{o_.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </Card>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
            {o.lines.map((l) => (
              <li key={l.id} className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="esim-line">
                <div className="bg-brand-800 px-4 py-3 text-white">
                  <p className="truncate font-bold" dir="ltr">{l.name}</p>
                  <p className="text-xs opacity-90">{fmt(o_.sentTo, { email: l.email })}</p>
                </div>
                <div className="flex flex-col items-center p-4">
                  <div className="size-40 [&>svg]:size-full" role="img" aria-label={l.activationCode} dangerouslySetInnerHTML={{ __html: data.qr[l.id] ?? "" }} />
                </div>
                <dl className="space-y-1.5 border-t border-dashed border-slate-300 px-4 py-3 text-xs">
                  {l.phoneNumber && <div className="flex justify-between gap-2"><dt className="text-slate-500">{o_.number}</dt><dd className="ltr-nums font-bold">{l.phoneNumber}</dd></div>}
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">{o_.smdp}</dt><dd className="break-all font-mono">{l.smdpAddress}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">{o_.code}</dt><dd className="break-all font-mono">{l.matchingId}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-slate-500">{o_.iccid}</dt><dd className="ltr-nums font-mono">{l.iccid}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-center print:hidden"><Link href={`/${locale}/esim`} className="text-sm font-semibold text-brand-700 hover:underline">{o_.buy}</Link></p>
    </div>
  );
}
