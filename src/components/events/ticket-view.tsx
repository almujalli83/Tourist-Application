"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fmtKsa } from "@/lib/events/format";
import type { EventOrder } from "@/lib/events/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { CalendarIcon, MapPinIcon, TicketIcon } from "../icons";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { WalletTicketsPane } from "../wallet-tickets-pane";
import { EVENT_COLORS } from "./events-view";

interface OrderView { order: EventOrder; qr: Record<string, string>; canCancel: boolean; deadline: string | null }

/** An event order: tickets with QR codes, printing and cancellation under the event's policy. */
export function TicketView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const tk = t.events.ticket;
  const ar = locale === "ar";
  const [data, setData] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) setMissing(true);
    else setData(await r.json());
  }, [id]);

  useEffect(() => {
    setFresh(new URLSearchParams(window.location.search).has("new"));
    void load();
  }, [load]);

  async function cancel() {
    if (!confirm(tk.confirmCancel)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/events/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setErr((t.events.errors as Record<string, string>)[body.error] ?? t.events.errors.generic);
      setFresh(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <Alert tone="error">{t.events.errors.generic}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const { order: o, qr } = data;
  const city = SAUDI_CITIES.find((c) => c.code === o.event.city);
  const when = fmtKsa(o.session.start, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const title = ar ? o.event.titleAr : o.event.titleEn;
  const venue = `${ar ? o.event.venueAr : o.event.venueEn}${city ? ` · ${ar ? city.ar : city.en}` : ""}`;
  const cancelled = o.status === "CANCELLED";
  const color = EVENT_COLORS[o.event.category];

  return (
    <div className="space-y-6">
      <div className="print:hidden"><BackLink href={`/${locale}/account/wallet`} label={t.wallet.title} /></div>
      {fresh && !cancelled && <Alert tone="success" className="print:hidden">{tk.purchased}</Alert>}
      {cancelled && o.cancellation && <Alert tone="warning">{fmt(tk.cancelled, { amount: money(o.cancellation.refundSAR) })}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold" style={{ color }}>{t.events.categories[o.event.category]}</p>
            <h1 className="mt-1 text-2xl font-bold">{title}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPinIcon className="size-4" />{venue}</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-600"><CalendarIcon className="size-4" />{when}</p>
          </div>
          <Badge tone={cancelled ? "red" : "brand"}>{tk.status[o.status]}</Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">{tk.reference}</dt><dd className="ltr-nums font-bold">{o.reference}</dd></div>
          <div><dt className="text-xs text-slate-500">{tk.holder}</dt><dd className="font-semibold">{o.holderName}</dd></div>
          <div><dt className="text-xs text-slate-500">{tk.paid}</dt><dd className="font-semibold">{money(o.totalSAR)} · {o.payment.method.toUpperCase()} •••{o.payment.last4}</dd></div>
          <div><dt className="text-xs text-slate-500">{tk.providerRef}</dt><dd className="ltr-nums font-semibold">{t.events.providers[o.provider]} · {o.providerRef}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 print:hidden">
          {!cancelled && <PrintButton label={tk.print} />}
          {data.canCancel ? (
            <>
              <Button variant="danger" onClick={cancel} loading={busy}>{tk.cancel}</Button>
              <span className="text-xs text-slate-500">{fmt(tk.cancelUntil, { date: fmtKsa(data.deadline!, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}</span>
            </>
          ) : !cancelled && (
            <span className="text-xs text-slate-500">
              {data.deadline ? fmt(tk.cancelClosed, { date: fmtKsa(data.deadline, locale, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) }) : tk.final}
            </span>
          )}
        </div>
      </Card>

      {!cancelled && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
          {o.tickets.map((tt, i) => (
            <li key={tt.id} className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="ticket">
              <div className="px-4 py-3 text-white" style={{ background: color }}>
                <p className="text-xs opacity-90">{fmt(tk.ticketN, { i: i + 1, n: o.tickets.length })}</p>
                <p className="truncate font-bold">{title}</p>
              </div>
              <div className="flex flex-col items-center p-4">
                {/* QR generated on the server from the ticket code. */}
                <div className="size-44 [&>svg]:size-full" aria-label={`${tk.code} ${tt.code}`} role="img" dangerouslySetInnerHTML={{ __html: qr[tt.id] ?? "" }} />
                <p className="ltr-nums mt-2 font-mono text-sm font-bold tracking-wider">{tt.code}</p>
                <p className="text-xs text-slate-500">{tk.showAtEntry}</p>
              </div>
              <dl className="grid grid-cols-2 gap-2 border-t border-dashed border-slate-300 px-4 py-3 text-xs">
                <div><dt className="text-slate-500">{tk.type}</dt><dd className="font-semibold">{ar ? tt.line.typeNameAr : tt.line.typeNameEn}</dd></div>
                <div><dt className="text-slate-500">{tk.seat}</dt><dd className="ltr-nums font-semibold">{tt.line.seat ? tt.line.seat.slice(tt.line.typeId.length + 1) : "—"}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">{tk.date}</dt><dd className="font-semibold">{when}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">{tk.holder}</dt><dd className="font-semibold">{o.holderName} · {o.reference}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center print:hidden"><Link href={`/${locale}/events`} className="text-sm font-semibold text-brand-700 hover:underline">{tk.browse}</Link></p>
    </div>
  );
}

/** Wallet pane: the account's event orders. */
export function EventTicketsPane({ orders }: { orders: EventOrder[] | null }) {
  const { t, locale, money } = useApp();
  const tk = t.events.ticket;
  const ar = locale === "ar";
  const now = Date.now();
  const items = orders?.map((o) => ({
    id: o.id,
    href: `/${locale}/account/tickets/${o.id}`,
    title: ar ? o.event.titleAr : o.event.titleEn,
    subtitle: `${fmtKsa(o.session.start, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${fmt(tk.tickets, { n: o.tickets.length })} · ${money(o.totalSAR)}`,
    status: { label: tk.status[o.status], tone: o.status === "CANCELLED" ? ("red" as const) : ("brand" as const) },
    upcoming: o.status === "CONFIRMED" && Date.parse(o.session.start) > now,
  })) ?? null;
  return (
    <WalletTicketsPane
      testid="wallet-event-tickets"
      title={tk.myTickets}
      subtitle={t.wallet.ticketsSubtitle}
      icon={<TicketIcon className="size-5" />}
      action={{ href: `/${locale}/events`, label: tk.browse }}
      items={items}
      emptyText={tk.empty}
    />
  );
}
