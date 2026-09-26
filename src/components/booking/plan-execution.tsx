"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import { useApp } from "../app-provider";
import { CheckIcon, HotelIcon, PlaneIcon, TicketIcon } from "../icons";
import { Alert, Badge, Button, Card, Spinner, Stars } from "../ui";
import { useBooking, type PlanAutoInput } from "./booking-context";
import { WizardShell } from "./wizard-shell";

const time = (iso: string) => iso.slice(11, 16);

/** The system carries out an approved plan; the traveller reviews (and can change) its choices. */
function Inner() {
  const { t, locale, money } = useApp();
  const x = t.planner.exec;
  const booking = useBooking();
  const router = useRouter();
  const planId = useSearchParams().get("plan");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [stepShown, setStepShown] = useState(0);
  const started = useRef(false);

  const hasSelection = !!booking.planAuto && booking.selectedFlights.length > 0 && booking.selectedHotels.length > 0;
  const needsRun = booking.hydrated && ((planId && booking.tripPlanId !== planId) || (booking.tripPlanId && !hasSelection));

  async function run(id: string) {
    setWorking(true);
    setError(null);
    setStepShown(0);
    const timer = setInterval(() => setStepShown((n) => Math.min(n + 1, x.workingSteps.length - 1)), 900);
    try {
      const r = await fetch(`/api/planner/plans/${encodeURIComponent(id)}/execute`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "generic");
      booking.startFromPlanAuto(d as PlanAutoInput, id);
      if (planId) router.replace(`/${locale}/package-visa/plan`);
    } catch (e) {
      setError((x.errors as Record<string, string>)[(e as Error).message] ?? x.errors.generic);
    } finally {
      clearInterval(timer);
      setWorking(false);
    }
  }

  useEffect(() => {
    if (!needsRun || started.current) return;
    started.current = true;
    void run((planId ?? booking.tripPlanId)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRun]);

  const backToPlan = `/${locale}/planner/${planId ?? booking.tripPlanId ?? ""}`;
  if (!booking.hydrated || working || (needsRun && !error)) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-lg place-items-center px-4 py-10" data-testid="plan-working">
        <Card className="w-full space-y-4 p-6">
          <p className="flex items-center gap-2 text-lg font-bold"><Spinner className="size-5 text-brand-700" />{x.working}</p>
          <ul className="space-y-2 text-sm">
            {x.workingSteps.map((s, i) => (
              <li key={s} className={i <= stepShown ? "flex items-center gap-2 text-ink" : "flex items-center gap-2 text-slate-400"}>
                {i < stepShown ? <CheckIcon className="size-4 text-brand-700" /> : <span className="size-4" />}{s}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }
  if (error || !booking.planAuto) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-10">
        <Alert tone="error">{error ?? x.errors.generic}</Alert>
        <div className="flex gap-2">
          {(planId ?? booking.tripPlanId) && <Button onClick={() => { started.current = true; void run((planId ?? booking.tripPlanId)!); }}>{x.retry}</Button>}
          <Link href={backToPlan} className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25">{x.backToPlan}</Link>
        </div>
      </div>
    );
  }

  const { extras, notes } = booking.planAuto;
  const change = (path: string) => <Link href={`/${locale}/package-visa/${path}`} className="text-sm font-semibold text-brand-700 hover:underline">{x.change}</Link>;
  const noteText = (n: (typeof notes)[number]) => {
    if (n.code === "hotelTier") return fmt(x.notes.hotelTier, { city: cityName(n.city, locale), wanted: n.wanted, stars: n.stars });
    if (n.code === "budgetDowngrade") return fmt(x.notes.budgetDowngrade, { stars: n.stars });
    if (n.code === "addedActivities") return fmt(x.notes.addedActivities, { n: n.count });
    if (n.code === "overBudget") return fmt(x.notes.overBudget, { total: money(n.totalSAR), max: money(n.maxSAR) });
    return "";
  };

  return (
    <WizardShell step={1} title={x.title} subtitle={x.subtitle} back={backToPlan} sidebarFooter={
      <Link href={`/${locale}/package-visa/documents`} className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800" data-testid="plan-continue">{x.continue}</Link>
    }>
      <div className="space-y-4" data-testid="plan-execution">
        {notes.length > 0 && (
          <Alert tone="info">
            <p className="font-semibold">{x.changesTitle}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">{notes.map((n, i) => <li key={i}>{noteText(n)}</li>)}</ul>
          </Alert>
        )}

        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><PlaneIcon className="size-5 text-brand-700" />{x.flights}</h2>{change("flights")}</div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {booking.selectedFlights.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="font-semibold">{cityName(f.from, locale)} → {cityName(f.to, locale)}</span> <span className="text-slate-500">· {fmtDay(f.departAt.slice(0, 10), locale)} · {time(f.departAt)}–{time(f.arriveAt)}</span></span>
                <span className="text-slate-600">{locale === "ar" ? f.carrierNameAr : f.carrierNameEn} {f.flightNo}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><HotelIcon className="size-5 text-brand-700" />{x.hotels}</h2>{change("hotels")}</div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {booking.selectedHotels.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><span className="font-semibold">{locale === "ar" ? h.nameAr : h.nameEn}</span> <span className="text-slate-500">· {cityName(h.city, locale)} · {fmt(x.nights, { n: h.nights })}</span></span>
                <span className="flex items-center gap-2"><Stars n={h.stars} /><Badge>{h.reviewScore}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>

        {booking.selectedActivities.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="font-bold">{x.activities}</h2>{change("activities")}</div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {booking.selectedActivities.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2.5"><span className="font-semibold">{locale === "ar" ? a.titleAr : a.titleEn}</span><span className="text-slate-500">{fmtDay(a.date, locale)} · {a.timeFrom}</span></li>
              ))}
            </ul>
          </Card>
        )}

        {(extras.events.length > 0 || extras.tables.length > 0) && (
          <Card className="p-5" data-testid="plan-extras">
            {extras.events.length > 0 && (
              <>
                <h2 className="flex items-center gap-2 font-bold"><TicketIcon className="size-5 text-brand-700" />{x.events}</h2>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {extras.events.map((e) => (
                    <li key={e.itemId} className="flex flex-wrap justify-between gap-2 py-2.5">
                      <span><span className="font-semibold">{locale === "ar" ? e.titleAr : e.titleEn}</span> <span className="text-slate-500">· {fmtDay(e.date, locale)} · {e.time} · {e.seats ? fmt(x.seats, { seats: e.seats.join("، ") }) : fmt(x.tickets, { n: e.tickets })}</span></span>
                      <span className="font-medium">{money(e.totalSAR)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {extras.tables.length > 0 && (
              <>
                <h2 className="mt-4 font-bold">{x.tables}</h2>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {extras.tables.map((r) => (
                    <li key={r.itemId} className="flex flex-wrap justify-between gap-2 py-2.5">
                      <span><span className="font-semibold">{locale === "ar" ? r.titleAr : r.titleEn}</span> <span className="text-slate-500">· {fmtDay(r.day, locale)} · {fmt(x.table, { time: r.time, n: r.party })}</span></span>
                      <span className="text-slate-600">{r.feeSAR ? fmt(x.tableFee, { amount: money(r.feeSAR) }) : x.tableFree}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-3 text-xs text-slate-500">{x.paidTogether}</p>
          </Card>
        )}

        {extras.issues.length > 0 && (
          <Alert tone="warning">
            <p className="font-semibold">{x.issuesTitle}</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">{extras.issues.map((i) => <li key={i.itemId}>{locale === "ar" ? i.titleAr : i.titleEn}: {x.issues[i.reason]}</li>)}</ul>
          </Alert>
        )}

        <Link href={`/${locale}/package-visa/documents`} className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-brand-700 text-base font-semibold text-white hover:bg-brand-800 lg:hidden">{x.continue}</Link>
      </div>
    </WizardShell>
  );
}

export function PlanExecution() {
  return <Suspense><Inner /></Suspense>;
}
