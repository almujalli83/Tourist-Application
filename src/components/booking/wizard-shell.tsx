"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { diffDays } from "@/lib/dates";
import { useApp } from "../app-provider";
import { CheckIcon } from "../icons";
import { Card, cx, Spinner } from "../ui";
import { useBooking } from "./booking-context";

export function Stepper({ current }: { current: number }) {
  const { t } = useApp();
  return (
    <nav aria-label="progress" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-2 sm:gap-3">
        {t.steps.map((label, i) => (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <span
              className={cx(
                "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                i < current ? "bg-brand-600 text-white" : i === current ? "bg-gold-500 text-white ring-4 ring-gold-100" : "bg-slate-200 text-slate-500",
              )}
            >
              {i < current ? <CheckIcon className="size-4" /> : i + 1}
            </span>
            <span className={cx("text-xs font-semibold sm:text-sm", i === current ? "text-ink" : "text-slate-500", i !== current && "hidden sm:inline")}>
              {label}
            </span>
            {i < t.steps.length - 1 && <span className="h-px w-5 bg-slate-300 sm:w-8" />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function TripSummaryBar() {
  const { t, locale } = useApp();
  const { criteria } = useBooking();
  if (!criteria) return null;
  const pax = criteria.pax.adults + criteria.pax.children + criteria.pax.infants;
  return (
    <p className="text-sm text-slate-600">
      {fmt(t.search.summary, {
        origin: cityName(criteria.origin, locale),
        cities: criteria.stays.map((s) => cityName(s.city, locale)).join(locale === "ar" ? "، " : ", "),
        nights: diffDays(criteria.departureDate, criteria.returnDate),
        pax,
      })}
    </p>
  );
}

export function PriceSummary({ footer }: { footer?: ReactNode }) {
  const { t, money, currency } = useApp();
  const { price } = useBooking();
  if (!price) return null;
  const rows = [
    { label: t.review.flights, v: price.flightsSAR },
    { label: t.review.hotels, v: price.hotelsSAR },
    ...(price.activitiesSAR ? [{ label: t.review.activities, v: price.activitiesSAR }] : []),
    { label: t.review.visaInsurance, v: price.visaInsuranceSAR, sub: fmt(t.review.visaFeeLine, { fee: money(price.visaFeePerTravellerSAR), n: price.travellers }) },
  ];
  return (
    <Card className="p-5">
      <h3 className="font-bold">{t.review.priceSummary}</h3>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-3">
            <dt className="text-slate-600">
              {r.label}
              {r.sub && <span className="mt-0.5 block text-xs text-slate-400">{r.sub}</span>}
            </dt>
            <dd className="ltr-nums font-medium tabular-nums">{r.v ? money(r.v) : "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
        <span className="font-bold">{t.common.total}</span>
        <span className="ltr-nums text-lg font-bold text-brand-800 tabular-nums">{money(price.totalSAR)}</span>
      </div>
      {currency !== "SAR" && <p className="mt-2 text-xs text-slate-500">{t.review.chargedInSAR}</p>}
      {footer && <div className="mt-4">{footer}</div>}
    </Card>
  );
}

/** Layout for every step after search: stepper, trip summary, main column and price sidebar. */
export function WizardShell({ step, title, subtitle, children, sidebar = true, sidebarFooter }: {
  step: number; title: string; subtitle?: string; children: ReactNode; sidebar?: boolean; sidebarFooter?: ReactNode;
}) {
  const { locale } = useApp();
  const { criteria, hydrated } = useBooking();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !criteria && step > 0) router.replace(`/${locale}/package-visa`);
  }, [hydrated, criteria, step, router, locale]);

  if (!hydrated || (!criteria && step > 0)) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-brand-700">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Stepper current={step} />
      <div className="mt-6 flex flex-col gap-1">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        {step > 0 && <TripSummaryBar />}
      </div>
      <div className={cx("mt-6 grid gap-6", sidebar && "lg:grid-cols-[1fr_340px]")}>
        <div className="min-w-0">{children}</div>
        {sidebar && (
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <PriceSummary footer={sidebarFooter} />
          </aside>
        )}
      </div>
    </div>
  );
}
