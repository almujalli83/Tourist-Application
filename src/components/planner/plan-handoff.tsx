"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { validateCriteria } from "@/lib/itinerary";
import { takeHandoff } from "@/lib/planner/handoff";
import { todayISO } from "@/lib/dates";
import { useApp } from "../app-provider";
import { useBooking } from "../booking/booking-context";

/** On the package search page: continues an approved trip plan straight to the flights step. */
export function PlanHandoff() {
  const { locale } = useApp();
  const { hydrated, startFromPlan } = useBooking();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    const h = takeHandoff();
    if (!h || validateCriteria(h.criteria, todayISO()).length) return;
    startFromPlan(h.criteria, h.planId);
    router.replace(`/${locale}/package-visa/flights`);
  }, [hydrated, startFromPlan, router, locale]);
  return null;
}

/** Invitation to the planner shown above the package search. */
export function PlannerBanner() {
  const { t, locale } = useApp();
  const b = t.planner.banner;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-100 bg-gold-50 px-5 py-4">
      <div className="min-w-0">
        <p className="font-bold text-ink">{b.title}</p>
        <p className="text-sm text-slate-600">{b.desc}</p>
      </div>
      <Link href={`/${locale}/planner`} className="inline-flex h-10 shrink-0 items-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink hover:bg-gold-600">{b.cta}</Link>
    </div>
  );
}
