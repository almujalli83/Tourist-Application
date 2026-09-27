"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { GuideBooking, GuideBookingStatus } from "@/lib/guides/bookings";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { ContactButtons, langLabel } from "./guide-card";

export const GUIDE_STATUS_TONE: Record<GuideBookingStatus, "amber" | "brand" | "red" | "slate"> = { pending: "amber", confirmed: "brand", declined: "red", cancelled: "red" };

export function GuideBookingView({ id }: { id: string }) {
  const { t, locale } = useApp();
  const s = t.guides;
  const b_ = s.booking;
  const [b, setB] = useState<(GuideBooking & { respondUrl?: string }) | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(`/api/guides/bookings/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { booking: null })).then((d) => setB(d.booking)).catch(() => setB(null));
  }, [id]);
  useEffect(load, [load]);

  if (b === undefined) return <div className="grid h-60 place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  if (!b) return <Card className="p-8 text-center text-sm text-slate-500">{s.errors.notFound}</Card>;
  const ar = locale === "ar";
  async function cancel() {
    if (!confirm(b_.cancelConfirm)) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/guides/bookings/${id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
    load();
  }
  const live = b.status === "pending" || b.status === "confirmed";
  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="guide-booking">
      <BackLink href={`/${locale}/account`} label={t.account.bookings} className="-ms-2.5" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{fmt(b_.title, { ref: b.reference })}</h1>
        <span data-testid="guide-booking-status"><Badge tone={GUIDE_STATUS_TONE[b.status]}>{b_.status[b.status]}</Badge></span>
      </div>
      {b.cancelReason && <Alert tone="warning">{b_.cancelReason[b.cancelReason]}</Alert>}
      <Card className="space-y-3 p-5">
        <p className="text-lg font-bold">
          <Link href={`/${locale}/guides/${encodeURIComponent(b.guide.licenseNo)}`} className="hover:text-brand-700">{ar ? b.guide.nameAr : b.guide.nameEn}</Link>
          {b.guide.demo && <Badge tone="gold" className="ms-2">{s.sample}</Badge>}
        </p>
        <p className="text-sm text-slate-600">{s.license}: <span dir="ltr" className="ltr-nums">{b.guide.licenseNo}</span></p>
        <p className="text-sm">{fmt(b_.when, { date: fmtDay(b.date, locale, { weekday: "long", day: "numeric", month: "long" }), time: b.startTime, hours: b.hours })}</p>
        <p className="text-sm">{cityName(b.city, locale)} · {fmt(b_.people, { n: b.people })} · {langLabel(b.language, locale)}</p>
        {b.notes && <p className="whitespace-pre-line text-sm text-slate-600" dir="auto">{b.notes}</p>}
        {b.guideNote && <p className="rounded-lg bg-brand-50 p-3 text-sm"><b>{b_.guideNote}:</b> <span dir="auto">{b.guideNote}</span></p>}
        {live && <ContactButtons phone={b.guide.phone} />}
      </Card>
      {err && <Alert tone="error">{err}</Alert>}
      <div className="flex flex-wrap gap-2">
        {live && <Button variant="secondary" loading={busy} onClick={cancel} data-testid="guide-booking-cancel">{b_.cancel}</Button>}
        {!live && <Link href={`/${locale}/guides?city=${b.city}&language=${b.language}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">{b_.another}</Link>}
        {b.respondUrl && <Link href={`/${locale}${b.respondUrl}`} className="inline-flex h-10 items-center rounded-lg bg-gold-50 px-4 text-sm font-semibold text-gold-700 ring-1 ring-gold-500/30" data-testid="guide-simulate">{b_.simulate}</Link>}
      </div>
    </div>
  );
}
