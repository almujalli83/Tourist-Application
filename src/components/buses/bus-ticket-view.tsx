"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtKsa } from "@/lib/events/format";
import type { BusOrder } from "@/lib/buses/types";
import { useApp } from "../app-provider";
import { ReceiptLink } from "../payments/receipt-link";
import { BackLink } from "../back-link";
import { BusIcon } from "../icons";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

/** A bus booking: one QR ticket per passenger and seat, and cancellation. */
export function BusTicketView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const b = t.buses;
  const [data, setData] = useState<{ order: BusOrder; qr: string[] } | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/buses/orders/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : "missing")).then(setData).catch(() => setData("missing"));
  }, [id]);
  if (data === "missing") return <Alert tone="error">{b.errors.generic}</Alert>;
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const o = data.order;
  async function cancel() {
    if (!confirm(b.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/buses/orders/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((b.errors as Record<string, string>)[d.error] ?? b.errors.generic);
    setData((x) => (x && x !== "missing" ? { ...x, order: d.order } : x));
  }
  const when = (iso: string) => fmtKsa(iso, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-4" data-testid="bus-ticket">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><BusIcon className="size-6 text-brand-700" />{fmt(b.ticketTitle, { pnr: o.pnr })}</h1>
        <Badge tone={o.status === "CONFIRMED" ? "brand" : "red"}><span data-testid="bus-status">{b.status[o.status]}</span></Badge>
      </div>
      <Card className="p-5 text-sm">
        <p className="font-semibold">{locale === "ar" ? o.providerNameAr : o.providerNameEn} · {o.trip.tripNo} · {b.classes[o.trip.cls]}</p>
        <p className="mt-1">{cityName(o.trip.from, locale)} <span dir="ltr">{when(o.trip.depart)}</span> {locale === "ar" ? "←" : "→"} {cityName(o.trip.to, locale)} <span dir="ltr">{when(o.trip.arrive)}</span></p>
        <p className="mt-1 text-slate-600">{b.total}: <span className="ltr-nums font-bold">{money(o.totalSAR)}</span></p>
        <ReceiptLink transactionId={o.payment.transactionId} className="mt-1" />
        {o.cancellation && <p className="mt-2 font-semibold text-red-700" data-testid="bus-refund">{fmt(b.cancelled, { amount: money(o.cancellation.refundSAR) })}</p>}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {o.tickets.map((k, i) => (
          <Card key={k.code} className="p-4 text-center" data-testid="bus-qr">
            <p className="font-bold">{o.passengers[k.passenger].nameEn}</p>
            <p className="text-sm">{fmt(b.seat, { seat: k.seat })} · {o.passengers[k.passenger].type === "adult" ? b.adult : b.child}</p>
            <div className={`mx-auto mt-2 w-40 [&>svg]:h-auto [&>svg]:w-full ${o.status !== "CONFIRMED" ? "opacity-30" : ""}`} dangerouslySetInnerHTML={{ __html: data.qr[i] }} />
            <p className="font-mono text-xs" dir="ltr">{k.code}</p>
          </Card>
        ))}
      </div>
      <p className="text-sm text-slate-600">{b.boarding}</p>
      <p className="text-xs text-slate-500">{b.refundPolicy}</p>
      {o.sandbox && <p className="text-xs font-semibold text-amber-700">{b.sample}</p>}
      {err && <Alert tone="error">{err}</Alert>}
      {o.status === "CONFIRMED" && Date.parse(o.trip.depart) > Date.now() && <Button variant="danger" loading={busy} onClick={() => void cancel()} data-testid="bus-cancel">{b.cancel}</Button>}
    </div>
  );
}
