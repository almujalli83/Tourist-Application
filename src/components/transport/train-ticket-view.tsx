"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa, ksaDay } from "@/lib/events/format";
import type { TrainOrder } from "@/lib/trains/orders";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { TrainIcon } from "../icons";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

interface StationLite { code: string; nameAr: string; nameEn: string }
interface LineLite { id: string; nameAr: string; nameEn: string; color: string }
interface OrderView { order: TrainOrder; qr: Record<string, string>; canCancel: boolean; deadline: string; refund: { refundSAR: number; feeSAR: number } | null }

function useNetwork() {
  const [net, setNet] = useState<{ stations: StationLite[]; lines: LineLite[] } | null>(null);
  useEffect(() => {
    fetch("/api/trains/stations").then((r) => r.json()).then(setNet).catch(() => setNet({ stations: [], lines: [] }));
  }, []);
  return net;
}

/** A train booking: one ticket per passenger per trip, with QR codes; cancellation under SAR's policy. */
export function TrainTicketView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const tk = t.trains.ticket;
  const ar = locale === "ar";
  const net = useNetwork();
  const [data, setData] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/trains/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) setMissing(true);
    else setData(await r.json());
  }, [id]);
  useEffect(() => {
    setFresh(new URLSearchParams(window.location.search).has("new"));
    void load();
  }, [load]);

  if (missing) return <Alert tone="error">{t.trains.errors.generic}</Alert>;
  if (!data || !net) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const { order: o, qr } = data;
  const st = (code: string) => {
    const s = net.stations.find((x) => x.code === code);
    return s ? (ar ? s.nameAr : s.nameEn) : code;
  };
  const cancelled = o.status === "CANCELLED";

  async function cancel() {
    if (!confirm(fmt(tk.confirmCancel, { refund: money(data!.refund?.refundSAR ?? 0) }))) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/trains/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setErr((t.trains.errors as Record<string, string>)[body.error] ?? t.trains.errors.generic);
      setFresh(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden"><BackLink href={`/${locale}/account/wallet`} label={t.wallet.title} /></div>
      {fresh && !cancelled && <Alert tone="success" className="print:hidden">{tk.purchased}</Alert>}
      {cancelled && o.cancellation && <Alert tone="warning">{fmt(tk.cancelled, { refund: money(o.cancellation.refundSAR), fee: money(o.cancellation.feeSAR) })}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><TrainIcon className="size-6 text-brand-700" />{tk.title}</h1>
          <Badge tone={cancelled ? "red" : "brand"}>{tk.status[o.status]}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">{tk.reference}</dt><dd className="ltr-nums font-bold">{o.reference}</dd></div>
          <div><dt className="text-xs text-slate-500">{tk.pnr}</dt><dd className="ltr-nums font-bold">{o.pnr}</dd></div>
          <div><dt className="text-xs text-slate-500">{tk.paid}</dt><dd className="font-semibold">{money(o.totalSAR)} · {o.payment.method.toUpperCase()} •••{o.payment.last4}</dd></div>
        </dl>
        <ul className="mt-4 space-y-2">
          {o.legs.map((l, i) => {
            const line = net.lines.find((x) => x.id === l.trip.lineId);
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <span className="h-9 w-1.5 rounded-full" style={{ background: line?.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{i === 0 ? t.trains.outbound : t.trains.return}: {st(l.trip.from)} → {st(l.trip.to)}</p>
                  <p className="text-xs text-slate-500">
                    {fmtKsa(l.trip.depart, locale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} → {fmtKsa(l.trip.arrive, locale, { hour: "2-digit", minute: "2-digit" })}{ksaDay(l.trip.arrive) !== ksaDay(l.trip.depart) && " (+1)"}
                    {" · "}{fmt(t.trains.train, { no: l.trip.trainNo })} · {line ? (ar ? line.nameAr : line.nameEn) : ""} · {t.trains.classes[l.cls]}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        {!cancelled && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 print:hidden">
            <PrintButton label={tk.print} />
            {data.canCancel ? (
              <>
                <Button variant="danger" onClick={cancel} loading={busy}>{tk.cancel}</Button>
                <span className="text-xs text-slate-500">
                  {data.refund && fmt(tk.refundNow, { refund: money(data.refund.refundSAR), fee: money(data.refund.feeSAR) })}
                  {" · "}{fmt(tk.cancelUntil, { date: fmtKsa(data.deadline, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}
                </span>
              </>
            ) : <span className="text-xs text-slate-500">{tk.cancelClosed}</span>}
          </div>
        )}
      </Card>

      {!cancelled && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {o.tickets.map((tt) => {
            const leg = o.legs[tt.leg];
            const p = o.passengers[tt.passenger];
            const line = net.lines.find((x) => x.id === leg.trip.lineId);
            return (
              <li key={tt.id} className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="train-ticket">
                <div className="px-4 py-3 text-white" style={{ background: line?.color ?? "#05372b" }}>
                  <p className="text-xs opacity-90">{fmt(t.trains.train, { no: leg.trip.trainNo })} · {t.trains.classes[leg.cls]}</p>
                  <p className="truncate font-bold">{st(leg.trip.from)} → {st(leg.trip.to)}</p>
                </div>
                <div className="flex flex-col items-center p-4">
                  <div className="size-40 [&>svg]:size-full" role="img" aria-label={tt.code} dangerouslySetInnerHTML={{ __html: qr[tt.id] ?? "" }} />
                  <p className="ltr-nums mt-2 font-mono text-sm font-bold tracking-wider">{tt.code}</p>
                  <p className="text-center text-xs text-slate-500">{tk.showAtGate}</p>
                </div>
                <dl className="grid grid-cols-2 gap-2 border-t border-dashed border-slate-300 px-4 py-3 text-xs">
                  <div className="col-span-2"><dt className="text-slate-500">{tk.passenger}</dt><dd className="font-semibold" dir="ltr">{p.nameEn} <span className="font-normal text-slate-500">({t.trains.types[p.type]})</span></dd></div>
                  <div><dt className="text-slate-500">{tk.passport}</dt><dd className="ltr-nums font-semibold">{p.nationality} {p.passportMasked}</dd></div>
                  <div><dt className="text-slate-500">{tk.seat}</dt><dd className="ltr-nums font-semibold">{tt.seat}</dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">{t.events.ticket.date}</dt><dd className="font-semibold">{fmtKsa(leg.trip.depart, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-center print:hidden"><Link href={`/${locale}/trains`} className="text-sm font-semibold text-brand-700 hover:underline">{tk.book}</Link></p>
    </div>
  );
}

/** Wallet section: the account's train bookings. */
export function TrainTicketsSection() {
  const { t, locale, money } = useApp();
  const tk = t.trains.ticket;
  const ar = locale === "ar";
  const net = useNetwork();
  const [orders, setOrders] = useState<TrainOrder[] | null>(null);

  useEffect(() => {
    fetch("/api/trains/orders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((d: { orders: TrainOrder[] }) => setOrders(d.orders))
      .catch(() => setOrders([]));
  }, []);
  const st = (code: string) => {
    const s = net?.stations.find((x) => x.code === code);
    return s ? (ar ? s.nameAr : s.nameEn) : code;
  };

  return (
    <Card className="overflow-hidden" data-testid="wallet-train-tickets">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="font-bold">{tk.myTickets}</h2>
        <Link href={`/${locale}/trains`} className="text-sm font-semibold text-brand-700 hover:underline">{tk.book}</Link>
      </div>
      {orders === null ? (
        <div className="grid place-items-center py-6"><Spinner className="size-5 text-brand-600" /></div>
      ) : orders.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{tk.empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/${locale}/account/train-tickets/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="font-semibold">{st(o.legs[0].trip.from)} {o.legs.length > 1 ? "⇄" : "→"} {st(o.legs[0].trip.to)}</p>
                  <p className="text-xs text-slate-500">
                    {fmtKsa(o.legs[0].trip.depart, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {fmt(tk.tickets, { n: o.tickets.length })} · {money(o.totalSAR)}
                  </p>
                </div>
                <Badge tone={o.status === "CANCELLED" ? "red" : "brand"}>{tk.status[o.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
