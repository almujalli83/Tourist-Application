"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { getCountry } from "@/lib/data/countries";
import type { EvisaApplication } from "@/lib/evisa/service";
import { fmtDay } from "@/lib/events/format";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { PassportIcon } from "../icons";
import { ReceiptLink } from "../payments/receipt-link";
import { PrintButton } from "../print-button";
import { Alert, Badge, Button, Card, Spinner } from "../ui";

const TONE = { submitted: "amber", in_review: "amber", approved: "brand", rejected: "red", failed: "red", not_submitted: "slate" } as const;

/** A tourist eVisa application: each traveller's decision, visa number and validity; refreshed while pending. */
export function EvisaAppView({ id }: { id: string }) {
  const { t, locale, money } = useApp();
  const v = t.evisa;
  const [app, setApp] = useState<EvisaApplication | null | "missing">(null);
  const [busy, setBusy] = useState(false);
  const load = () => fetch(`/api/evisa/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setApp(d?.application ?? "missing")).catch(() => setApp("missing"));
  useEffect(() => void load(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // While a decision is pending, ask again every 20 seconds.
  const pending = app && app !== "missing" && app.status === "in_progress";
  useEffect(() => {
    if (!pending) return;
    const h = setInterval(() => void load(), 20_000);
    return () => clearInterval(h);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps
  if (app === "missing") return <Alert tone="error">{v.errors.notFound}</Alert>;
  if (!app) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const day = (d: string) => fmtDay(d, locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-4" data-testid="evisa-app">
      <BackLink href={`/${locale}/account`} label={t.account.title} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><PassportIcon className="size-6 text-brand-700" />{fmt(v.appTitle, { ref: app.reference })}</h1>
        <Badge tone={app.status === "failed" ? "red" : app.status === "completed" ? "brand" : "amber"}><span data-testid="evisa-app-status">{v.appStatus[app.status]}</span></Badge>
      </div>
      {app.sandbox && <Alert tone="info">{v.sandbox}</Alert>}
      <p className="text-sm text-slate-600">{fmt(v.arrivalOn, { date: day(app.arrivalDate) })}{app.clientReference ? ` · ${app.clientReference}` : ""}</p>
      {pending && <Alert tone="info">{v.checking}</Alert>}
      {app.applicants.map((a, i) => (
        <Card key={i} className="space-y-2 p-5 text-sm" data-testid="evisa-applicant">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-base font-bold" dir="ltr">{a.nameEn}</p>
            <Badge tone={TONE[a.status]}><span data-testid="evisa-applicant-status">{v.status[a.status]}</span></Badge>
          </div>
          <p className="text-slate-600">
            {getCountry(a.nationality)?.[locale] ?? a.nationality} · <span dir="ltr">{a.passportMasked}</span>
            {a.sponsorIndex !== null && app.applicants[a.sponsorIndex] ? ` · ${fmt(v.companion, { name: app.applicants[a.sponsorIndex].nameEn })}` : ""}
            {a.applicationRef ? <> · {v.applicationRef} <span className="ltr-nums">{a.applicationRef}</span></> : null}
          </p>
          {a.status === "approved" && (
            <div className="rounded-lg bg-brand-50 p-3">
              <p className="font-semibold">{v.visaNumber}: <span className="ltr-nums text-lg" data-testid="evisa-number">{a.visaNumber}</span></p>
              {a.issueDate && a.expiryDate && <p className="text-slate-700">{fmt(v.validity, { from: day(a.issueDate), to: day(a.expiryDate) })}</p>}
              {a.insuranceStatus && <p className="text-slate-700">{v.insurance}: {v.insuranceStatus[a.insuranceStatus as keyof typeof v.insuranceStatus] ?? a.insuranceStatus}</p>}
              <p className="mt-1 text-xs text-slate-600">{v.carry}</p>
              <Link href={`/${locale}/account/wallet`} className="mt-2 inline-flex text-sm font-semibold text-brand-800 underline" data-testid="evisa-wallet-link">{v.inWallet}</Link>
            </div>
          )}
          {a.reason && <p className="text-red-700">{v.reason}: {a.reason}</p>}
          {a.refundedSAR > 0 && <p className="font-semibold text-brand-800">{fmt(v.refunded, { amount: money(a.refundedSAR) })}</p>}
        </Card>
      ))}
      <Card className="space-y-2 p-5 text-sm">
        <p>{v.paid}: <span className="ltr-nums font-bold">{money(app.totalSAR - app.refundedSAR)}</span></p>
        <ReceiptLink transactionId={app.payment.transactionId} />
        <div className="flex flex-wrap gap-2 pt-1 print:hidden">
          {pending && <Button variant="secondary" loading={busy} onClick={async () => { setBusy(true); await load(); setBusy(false); }} data-testid="evisa-refresh">{v.refresh}</Button>}
          <PrintButton label={t.standalone.stay.print} />
          <Link href={`/${locale}/evisa`} className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">{v.more}</Link>
        </div>
      </Card>
    </div>
  );
}
