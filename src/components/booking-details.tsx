"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { Eligibility } from "@/lib/bookings/modify";
import type { BookingModification, StoredBooking } from "@/lib/bookings/types";
import { cityName } from "@/lib/data/cities";
import { countryName } from "@/lib/data/countries";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { CheckIcon, RefreshIcon } from "./icons";
import { Alert, Badge, Button, Card, cx, Spinner } from "./ui";

const FINAL = ["COMPLETED", "REJECTED", "CANCELLED", "VALIDATION_FAILED", "PAYMENT_FAILED"];

export function StatusBadge({ status }: { status: string | null }) {
  const { t } = useApp();
  if (!status) return <Badge>—</Badge>;
  const tone = ["COMPLETED", "ISSUED", "VALID", "VALIDATION_PASSED", "PAYMENT_COMPLETED"].includes(status)
    ? "brand"
    : ["REJECTED", "FAILED", "INVALID", "VALIDATION_FAILED", "PAYMENT_FAILED", "SUBMISSION_FAILED", "CANCELLED"].includes(status)
      ? "red"
      : "amber";
  return <Badge tone={tone}>{t.confirmation.statuses[status] ?? status}</Badge>;
}

export function BookingDetails({ id, fresh, updated }: { id: string; fresh?: boolean; updated?: boolean }) {
  const { t, locale, money } = useApp();
  const [booking, setBooking] = useState<StoredBooking | null>(null);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    () =>
      fetch(`/api/bookings/${id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          setBooking(d.booking);
          setEligibility(d.modification);
        }),
    [id],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/bookings/${id}/status`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setRefreshing(false);
    }
  }, [id, load]);

  useEffect(() => {
    load()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [load]);

  // Poll MT package status until it reaches a final state.
  useEffect(() => {
    if (!booking?.mt.packageId || FINAL.includes(booking.mt.packageStatus ?? "")) return;
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [booking?.mt.packageId, booking?.mt.packageStatus, refresh]);

  if (loading) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  if (error || !booking) return <Alert tone="error">{t.review.errors.generic}</Alert>;

  const failed = booking.status === "SUBMISSION_FAILED";

  return (
    <div className="space-y-5">
      <BackLink href={`/${locale}/account`} label={t.nav.myBookings} className="-ms-2.5" />
      {fresh && (
        <div className={cx("flex items-start gap-4 rounded-2xl p-6 text-white", failed ? "bg-amber-600" : "bg-brand-700")}>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20"><CheckIcon className="size-7" /></span>
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{failed ? t.confirmation.failedTitle : t.confirmation.title}</h1>
            <p className="mt-1 text-sm text-white/85">{t.confirmation.subtitle}</p>
          </div>
        </div>
      )}

      {updated && <Alert tone="success">{t.modify.updated}</Alert>}
      {eligibility?.allowed && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-gold-500/30 bg-gold-50 p-4 sm:p-5">
          <div className="text-sm">
            <p className="font-bold text-ink">{t.modify.title}</p>
            <p className="text-slate-600">{t.modify.deadline}: <span className="ltr-nums font-semibold">{new Date(eligibility.deadline).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })}</span></p>
          </div>
          <Link href={`/${locale}/account/bookings/${booking.id}/modify`} className="inline-flex h-11 items-center rounded-lg bg-gold-500 px-5 text-sm font-semibold text-white hover:bg-gold-600">
            {t.modify.button}
          </Link>
        </Card>
      )}

      <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">{t.confirmation.bookingRef}</p>
          <p className="ltr-nums text-lg font-bold text-brand-800">{booking.reference}</p>
          {booking.clientReference && <p className="text-xs text-slate-500">{t.review.clientReference}: {booking.clientReference}</p>}
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.confirmation.packageId}</p>
          <p className="ltr-nums break-all text-sm font-semibold">{booking.mt.packageId ?? "—"}</p>
          {booking.mt.mode === "sandbox" && <Badge tone="gold" className="mt-1">{t.common.sandbox}</Badge>}
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.confirmation.packageStatus}</p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={booking.mt.packageStatus ?? booking.status} />
            <Button size="sm" variant="ghost" onClick={refresh} loading={refreshing} aria-label={t.confirmation.refresh}>
              {!refreshing && <RefreshIcon className="size-4" />}{t.confirmation.refresh}
            </Button>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500">{t.confirmation.paid}</p>
          <p className="ltr-nums text-lg font-bold">{money(booking.payment.amountSAR)}</p>
          <p className="ltr-nums text-xs text-slate-500">{booking.payment.method.toUpperCase()} •••• {booking.payment.last4}</p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 font-bold">{t.common.travellers}</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                {[t.common.traveller, t.confirmation.applicationNo, t.common.status, t.confirmation.visaNumber, t.confirmation.visaStatus, t.confirmation.insuranceStatus].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {booking.applicants.map((a) => (
                <tr key={a.applicationNo} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{a.nameEn}</p>
                    <p className="ltr-nums text-xs text-slate-500">{a.passportNo} · {countryName(a.nationality, locale)}</p>
                    {a.submission && !a.submission.ok && (
                      <ul className="mt-1 text-xs text-red-700">
                        {a.submission.errors.map((e, i) => <li key={i}><span className="ltr-nums font-semibold">{e.code}</span> {e.message}</li>)}
                      </ul>
                    )}
                  </td>
                  <td className="ltr-nums px-4 py-3">{a.applicationNo}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.appStatus ?? (a.submission?.ok ? "RECEIVED" : "SUBMISSION_FAILED")} /></td>
                  <td className="ltr-nums px-4 py-3 font-semibold">{a.visaNumber ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={a.visaStatus} /></td>
                  <td className="px-4 py-3"><StatusBadge status={a.insuranceStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          {t.confirmation.emailNote}
          {booking.mt.lastCheckedAt && <> · {t.confirmation.lastChecked}: <span className="ltr-nums">{new Date(booking.mt.lastCheckedAt).toLocaleTimeString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB")}</span></>}
        </p>
      </Card>

      <Card className="p-5 sm:p-6">
        <p className="font-bold">{t.review.itinerary}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {booking.flights.map((f) => (
            <li key={f.id} className="flex flex-wrap justify-between gap-2">
              <span>✈ {cityName(f.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(f.to, locale)} <span className="ltr-nums text-slate-500">({f.flightNo}, {f.departAt.replace("T", " ")})</span></span>
              <span className="text-xs text-gold-700">{locale === "ar" ? f.agentNameAr : f.agentNameEn}</span>
            </li>
          ))}
          {booking.hotels.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2">
              <span>🏨 {locale === "ar" ? h.nameAr : h.nameEn} — {cityName(h.city, locale)} <span className="ltr-nums text-slate-500">({h.checkIn} → {h.checkOut})</span></span>
              <span className="text-xs text-gold-700">{locale === "ar" ? h.agentNameAr : h.agentNameEn}</span>
            </li>
          ))}
        </ul>
      </Card>

      {!!booking.modifications?.length && <ModificationLog booking={booking} onChange={setBooking} />}

      <div className="flex flex-wrap gap-3">
        <Link href={`/${locale}/account`} className="inline-flex h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white">{t.confirmation.viewBookings}</Link>
        <Link href={`/${locale}/package-visa`} className="inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold text-brand-800 ring-1 ring-brand-700/25">{t.confirmation.newBooking}</Link>
      </div>
    </div>
  );
}

function ModificationLog({ booking, onChange }: { booking: StoredBooking; onChange: (b: StoredBooking) => void }) {
  const { t, locale, money } = useApp();
  const l = t.modify.log;
  const [busy, setBusy] = useState<string | null>(null);
  const mods = [...(booking.modifications ?? [])].reverse();
  const latest = booking.modifications?.[booking.modifications.length - 1];

  async function retry(m: BookingModification) {
    setBusy(m.id);
    try {
      const res = await fetch(`/api/bookings/${booking.id}/modifications/${m.id}/retry`, { method: "POST" });
      if (res.ok) onChange((await res.json()).booking);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 font-bold">{l.title}</div>
      <ul className="divide-y divide-slate-100">
        {mods.map((m) => (
          <li key={m.id} className="space-y-2 px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <Badge tone={m.kind === "extend" ? "brand" : "gold"}>{m.kind === "extend" ? l.extend : l.shorten}</Badge>
                <span className="ltr-nums">{fmt(l.returnChange, { from: m.previousReturnDate, to: m.newReturnDate })}</span>
                <span className="ltr-nums text-xs font-normal text-slate-500">{new Date(m.createdAt).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {m.chargeSAR > 0 && <span className="ltr-nums text-xs font-semibold">{fmt(l.charged, { amount: money(m.chargeSAR) })}</span>}
                {m.refundSAR > 0 && <span className="ltr-nums text-xs font-semibold text-brand-700">{fmt(l.refunded, { amount: money(m.refundSAR) })}</span>}
                <Badge tone={m.mt.status === "UPDATED" ? "brand" : "red"}>{l.mt[m.mt.status]}</Badge>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-slate-600">
              {m.lines.map((x, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span>{t.modify.lineTypes[x.type]}: {locale === "ar" ? x.labelAr : x.labelEn}{x.agentNameEn && <span className="text-gold-700"> · {locale === "ar" ? x.agentNameAr : x.agentNameEn}</span>}</span>
                  <span className="ltr-nums">{x.amountSAR ? money(x.amountSAR) : ""}{x.nonRefundableSAR ? ` (${fmt(t.modify.nonRefundable, { amount: money(x.nonRefundableSAR) })})` : ""}</span>
                </li>
              ))}
            </ul>
            {!!m.agents?.length && (
              <p className="ltr-nums text-xs text-slate-500">{l.agentRefs}: {m.agents.map((x) => `${locale === "ar" ? x.agentNameAr : x.agentNameEn} ${x.reference}`).join(" · ")}</p>
            )}
            {m.notified && <p className="text-xs text-brand-700">✓ {l.notified}</p>}
            {m.mt.status !== "UPDATED" && m.id === latest?.id && (
              <Button size="sm" variant="secondary" loading={busy === m.id} onClick={() => void retry(m)}>{l.retry}</Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
