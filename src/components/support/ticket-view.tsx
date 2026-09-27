"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { PublicTicket } from "@/lib/support/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { Composer, Conversation, type Attachment } from "./conversation";
import { STATUS_TONE } from "./support-center";

/** A traveller's support ticket: the conversation, reply and close. */
export function TicketView({ id }: { id: string }) {
  const { t, locale } = useApp();
  const s = t.support;
  const [ticket, setTicket] = useState<PublicTicket | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/support/tickets/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!r.ok) return setMissing(true);
    setTicket((await r.json()).ticket);
  }, [id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [load]);

  async function post(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/support/tickets/${encodeURIComponent(id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
        return false;
      }
      setTicket(d.ticket);
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <Alert tone="error">{s.errors.generic}</Alert>;
  if (!ticket) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href={`/${locale}/support`} label={s.back} className="-ms-2.5" />
      <div>
        <p className="text-xs text-slate-500"><span className="ltr-nums">{ticket.number}</span> · {s.categories[ticket.category]}{ticket.booking && <> · {fmt(s.linked, { ref: ticket.booking.reference })}</>}</p>
        <h1 className="mt-1 text-xl font-bold" dir="auto">{ticket.subject}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span data-testid="ticket-status"><Badge tone={STATUS_TONE[ticket.status]}>{s.status[ticket.status]}</Badge></span>
          {ticket.demo && <Badge>{s.sample}</Badge>}
        </div>
      </div>
      <Card className="bg-slate-50/60 p-4">
        <Conversation ticket={ticket} viewer="traveller" />
      </Card>
      {ticket.status === "closed" && (
        <Alert tone="info">
          {s.closedNote}{" "}
          <Link href={`/${locale}/account/reviews`} className="font-semibold underline">{s.rate}</Link>
        </Alert>
      )}
      {err && <Alert tone="error">{err}</Alert>}
      <Card className="p-4">
        <p className="mb-2 text-sm font-semibold">{s.reply}</p>
        <Composer
          onSend={(message: string, attachments: Attachment[]) => post({ message, attachments })}
          placeholder={s.messageHint}
          busy={busy}
          testId="reply-composer"
          extra={() => ticket.status !== "closed" && <Button type="button" variant="ghost" onClick={() => void post({ action: "close" })} data-testid="ticket-close">{s.close}</Button>}
        />
      </Card>
    </div>
  );
}
