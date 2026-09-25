"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { diffDays } from "@/lib/dates";
import type { EsimKind, EsimPlan } from "@/lib/esim/tygo";
import { useApp } from "../app-provider";
import { EsimPlanPicker } from "../esim/plan-picker";
import { Button, Card, cx, Spinner } from "../ui";
import { useBooking } from "./booking-context";
import { WizardShell } from "./wizard-shell";

/** Optional package step after activities: eSIMs (Tygo) for some travellers, not part of the package price. */
export function EsimStep() {
  const { t, locale } = useApp();
  const e = t.esim;
  const booking = useBooking();
  const router = useRouter();
  const [plans, setPlans] = useState<EsimPlan[] | null>(null);
  const [kind, setKind] = useState<EsimKind>("data");
  const tripDays = booking.criteria ? diffDays(booking.criteria.departureDate, booking.criteria.returnDate) + 1 : null;

  useEffect(() => {
    fetch("/api/esim/plans").then((r) => r.json()).then((d) => setPlans(d.plans)).catch(() => setPlans([]));
  }, []);

  const chosen = booking.esim;
  const plan = plans?.find((p) => p.id === chosen?.planId) ?? null;
  useEffect(() => {
    if (plan) setKind(plan.kind);
  }, [plan]);

  const selectPlan = (p: EsimPlan) => booking.setEsim({ planId: p.id, priceSAR: p.priceSAR, travellers: chosen?.travellers.length ? chosen.travellers : booking.travellers.map((_, i) => i) });
  const toggle = (i: number) => {
    if (!plan) return;
    const cur = chosen?.travellers ?? [];
    booking.setEsim({ planId: plan.id, priceSAR: plan.priceSAR, travellers: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort((a, b) => a - b) });
  };
  const count = chosen?.travellers.length ?? 0;
  const next = (
    <div className="flex flex-col gap-2">
      <Button className="w-full" onClick={() => router.push(`/${locale}/package-visa/travellers`)}>
        {count ? fmt(e.continueWith, { n: count }) : e.skip}
      </Button>
      {count > 0 && (
        <button type="button" className="text-xs font-semibold text-slate-500 hover:underline" onClick={() => { booking.setEsim(null); router.push(`/${locale}/package-visa/travellers`); }}>
          {e.skip}
        </button>
      )}
    </div>
  );

  return (
    <WizardShell step={4} title={e.stepTitle} subtitle={e.stepSubtitle} sidebarFooter={next}>
      {!plans ? (
        <div className="flex items-center gap-3 rounded-xl bg-white p-6 text-brand-700"><Spinner className="size-6" /></div>
      ) : (
        <div className="space-y-6">
          <Card className="p-5">
            <EsimPlanPicker plans={plans} kind={kind} onKind={setKind} selectedId={chosen?.planId ?? null} onSelect={selectPlan} tripDays={tripDays} />
          </Card>
          {plan && (
            <Card className="p-5">
              <h2 className="font-bold">{e.whoTitle}</h2>
              <p className="mt-1 text-xs text-slate-500">{e.emailNote}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2" data-testid="esim-travellers">
                {booking.travellers.map((tr, i) => {
                  const on = chosen?.travellers.includes(i) ?? false;
                  return (
                    <label key={i} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", on ? "border-brand-600 bg-brand-50" : "border-slate-200")}>
                      <input type="checkbox" checked={on} onChange={() => toggle(i)} className="size-4 accent-brand-700" />
                      <span className="text-sm font-semibold">{fmt(e.travellerN, { n: i + 1 })}</span>
                      <span className="text-xs text-slate-500">{tr.declaredAge !== null && tr.declaredAge !== undefined ? fmt(e.minor, { age: tr.declaredAge }) : e.adult}</span>
                    </label>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between lg:hidden">
        <Button variant="secondary" onClick={() => router.push(`/${locale}/package-visa/activities`)}>{t.common.back}</Button>
        {next}
      </div>
    </WizardShell>
  );
}
