"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import type { TransitTicket } from "@/lib/transit/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

/** A metro & bus ticket: its QR code for the gates, activation and validity. */
export function TransitTicketView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const x = t.transit;
  const ar = locale === "ar";
  const [data, setData] = useState<{ ticket: TransitTicket; qrSvg: string } | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/transit/tickets/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : "missing")).then(setData).catch(() => setData("missing"));
  }, [id]);
  useEffect(load, [load]);
  if (data === "missing") return <Alert tone="error">{x.errors.generic}</Alert>;
  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const k = data.ticket;
  async function activate() {
    if (!confirm(x.activateConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/transit/tickets/${id}`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((x.errors as Record<string, string>)[d.error] ?? x.errors.generic);
    load();
  }
  return (
    <div className="mx-auto max-w-md space-y-4" data-testid="transit-ticket">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <Card className="space-y-4 p-6 text-center">
        <h1 className="text-xl font-bold">{fmt(x.ticketTitle, { name: ar ? k.nameAr : k.nameEn })}</h1>
        <Badge tone={k.status === "active" ? "brand" : k.status === "unused" ? "amber" : "slate"}><span data-testid="ticket-status">{x.status[k.status]}</span></Badge>
        <div className={`mx-auto w-56 [&>svg]:h-auto [&>svg]:w-full ${k.status === "expired" ? "opacity-30" : ""}`} dangerouslySetInnerHTML={{ __html: data.qrSvg }} data-testid="ticket-qr" />
        <p className="font-mono text-sm tracking-wider" dir="ltr">{k.code}</p>
        {k.validUntil && <p className="text-sm font-semibold" data-testid="ticket-valid">{fmt(x.validUntil, { time: fmtKsa(k.validUntil, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</p>}
        <p className="text-sm text-slate-600">{x.showQr}</p>
        {k.status === "unused" && <Button loading={busy} onClick={() => void activate()} data-testid="ticket-activate">{x.activate}</Button>}
        {err && <Alert tone="error">{err}</Alert>}
        <p className="text-xs text-slate-500"><span dir="ltr">{k.reference}</span> · {money(k.priceSAR)}</p>
        {k.sandbox && <p className="text-xs font-semibold text-amber-700">{x.sample}</p>}
      </Card>
    </div>
  );
}
