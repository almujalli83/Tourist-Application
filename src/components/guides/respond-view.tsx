"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { GuideBooking } from "@/lib/guides/bookings";
import { useApp } from "../app-provider";
import { Alert, Badge, Button, Card, Field, Input, Textarea } from "../ui";
import { langLabel } from "./guide-card";
import { GUIDE_STATUS_TONE } from "./guide-booking-view";

/** The guide's page (link in the email): confirm or decline the request. */
export function RespondView({ token, booking }: { token: string; booking: GuideBooking }) {
  const { t, locale } = useApp();
  const s = t.guides;
  const [b, setB] = useState(booking);
  const [note, setNote] = useState("");
  const [meetingText, setMeetingText] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"confirmed" | "declined" | null>(null);

  async function act(action: "confirm" | "decline") {
    setBusy(action);
    setErr(null);
    const r = await fetch("/api/guides/respond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action, note, meetingText, meetingLink }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) return setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
    setB(d.booking);
    setDone(d.booking.status);
  }
  return (
    <div className="mx-auto max-w-xl space-y-5" data-testid="guide-respond">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{s.respond.title} <span className="ltr-nums text-slate-500" dir="ltr">{b.reference}</span></h1>
        <Badge tone={GUIDE_STATUS_TONE[b.status]}>{s.booking.status[b.status]}</Badge>
      </div>
      <Card className="space-y-2 p-5 text-sm">
        <p><b>{s.respond.traveller}:</b> {b.userName}{b.userPhone && <> · <a href={`tel:${b.userPhone}`} dir="ltr" className="text-brand-700 underline">{b.userPhone}</a></>}</p>
        <p>{fmt(s.booking.when, { date: fmtDay(b.date, locale, { weekday: "long", day: "numeric", month: "long" }), time: b.startTime, hours: b.hours })}</p>
        <p>{cityName(b.city, locale)} · {fmt(s.booking.people, { n: b.people })} · {langLabel(b.language, locale)}</p>
        {b.notes && <p className="whitespace-pre-line text-slate-600" dir="auto">{b.notes}</p>}
      </Card>
      {done && <Alert tone="success"><span data-testid="guide-respond-done">{s.respond.done[done]}</span></Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      {b.status === "pending" && (
        <Card className="space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={s.respond.meeting} hint={s.respond.meetingHint}><Input value={meetingText} maxLength={200} onChange={(e) => setMeetingText(e.target.value)} dir="auto" data-testid="guide-meeting" /></Field>
            <Field label={s.respond.meetingLink} hint={s.respond.meetingLinkHint}><Input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} dir="ltr" placeholder="https://maps.google.com/…" data-testid="guide-meeting-link" /></Field>
          </div>
          <Field label={s.respond.note}><Textarea rows={2} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} dir="auto" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button loading={busy === "confirm"} disabled={!!busy} onClick={() => act("confirm")} data-testid="guide-confirm">{s.respond.confirm}</Button>
            <Button variant="secondary" loading={busy === "decline"} disabled={!!busy} onClick={() => act("decline")} data-testid="guide-decline">{s.respond.decline}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
