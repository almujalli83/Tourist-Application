"use client";

import { useMemo } from "react";
import { fmt } from "@/i18n";
import { PACKAGE_LIMITS } from "@/lib/config";
import { todayISO } from "@/lib/dates";
import { checkPackageRequirements, type PackageCheck } from "@/lib/package-rules";
import { useApp } from "../app-provider";
import { CheckIcon, ShieldIcon, XIcon } from "../icons";
import { Alert, Card, cx, SectionTitle } from "../ui";
import { useBooking } from "./booking-context";

/**
 * The current package against the key package requirements. With `useAges`, the minimum price
 * counts only travellers aged 18+ (from their dates of birth) instead of every search adult.
 */
export function usePackageCheck({ useAges = false } = {}): PackageCheck | null {
  const { criteria, selectedFlights, selectedHotels, price, travellers } = useBooking();
  return useMemo(() => {
    if (!criteria || !price) return null;
    const outbound = selectedFlights.find((f) => f.kind === "outbound");
    return checkPackageRequirements({
      criteria,
      flights: selectedFlights,
      hotels: selectedHotels,
      totalSAR: price.totalSAR,
      today: todayISO(),
      travellers: useAges ? travellers : undefined,
      arrivalDate: outbound?.arriveAt.slice(0, 10),
    });
  }, [criteria, selectedFlights, selectedHotels, price, travellers, useAges]);
}

export function PackageRequirements({ check, className }: { check: PackageCheck; className?: string }) {
  const { t, money } = useApp();
  const r = t.packageRules;
  const L = PACKAGE_LIMITS;
  const labels: Record<string, string> = {
    duration: fmt(r.items.duration, { min: L.minPackageDays, max: L.maxPackageDays, days: check.days }),
    leadTime: fmt(r.items.leadTime, { min: L.minLeadDays }),
    composition: fmt(r.items.composition, { adults: L.maxAdults, minors: L.maxMinors }),
    flights: r.items.flights,
    hotels: fmt(r.items.hotels, { stars: L.minHotelStars }),
    minPrice: fmt(r.items.minPrice, { min: money(check.minPriceSAR), total: money(check.totalSAR) }),
  };

  return (
    <Card className={cx("p-5 sm:p-6", className)}>
      <SectionTitle title={r.title} subtitle={r.subtitle} icon={<ShieldIcon className="size-5" />} />
      <ul className="mt-4 space-y-2.5">
        {check.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-3 text-sm">
            <span
              className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-brand-600 text-white" : "bg-red-100 text-red-700")}
              aria-label={c.ok ? "✓" : "✗"}
            >
              {c.ok ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className={cx(c.ok ? "text-slate-700" : "font-semibold text-red-800")}>{labels[c.id]}</span>
              {c.id === "minPrice" && (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {fmt(r.minPriceDetail, {
                    perAdult: money(L.minPricePerAdultSAR),
                    perDay: money(L.extraDayPerAdultSAR),
                    minDays: L.minPackageDays,
                    adults: check.adults,
                  })}
                  {!check.adultsFromAges && ` ${r.adultsNote}`}
                </span>
              )}
              {c.id === "minPrice" && !c.ok && (
                <span className="mt-1 block text-xs font-semibold text-red-700">{fmt(r.shortfall, { amount: money(check.shortfallSAR) })}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Alert tone={check.ok ? "success" : "warning"} className="mt-4">{check.ok ? r.allMet : r.notMet}</Alert>
    </Card>
  );
}
