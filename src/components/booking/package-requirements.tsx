"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { PACKAGE_LIMITS } from "@/lib/config";
import type { PackageCheck } from "@/lib/package-rules";
import { useApp } from "../app-provider";
import { Alert, cx } from "../ui";
import { useBooking } from "./booking-context";

export interface PackageCheckState {
  check: PackageCheck | null;
  loading: boolean;
  /** Error code from the server (e.g. offerExpired) when the check could not run. */
  error: string | null;
  /** True only when the server confirmed every requirement. */
  ok: boolean;
}

/**
 * Asks the server whether the selected package meets the key package requirements. With
 * `useAges`, the travellers' dates of birth are sent so that only adults aged 18+ count
 * towards the minimum price; otherwise the adults chosen in the search are counted.
 */
export function usePackageCheck({ useAges = false } = {}): PackageCheckState {
  const booking = useBooking();
  const { criteria, flights, hotels, activities, selectedFlights, selectedHotels, selectedActivities, travellers, hydrated } = booking;
  const birthDates = useAges ? travellers.map((t) => t.birthDate).join(",") : "";
  const payload = useMemo(() => {
    if (!hydrated || !criteria) return null;
    return JSON.stringify({
      selection: {
        criteria, flights, hotels, activities,
        offers: { flights: selectedFlights, hotels: selectedHotels, activities: selectedActivities },
      },
      travellers: useAges ? birthDates.split(",").map((birthDate) => ({ birthDate })) : undefined,
    });
  }, [hydrated, criteria, flights, hotels, activities, selectedFlights, selectedHotels, selectedActivities, useAges, birthDates]);

  const [state, setState] = useState<Omit<PackageCheckState, "ok">>({ check: null, loading: true, error: null });
  useEffect(() => {
    if (!payload) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(() => {
      fetch("/api/package/check", { method: "POST", headers: { "content-type": "application/json" }, body: payload, signal: ctrl.signal })
        .then(async (res) => {
          const data = await res.json();
          setState(res.ok ? { check: data.check, loading: false, error: null } : { check: null, loading: false, error: data.error ?? "generic" });
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setState({ check: null, loading: false, error: "generic" });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [payload]);
  return { ...state, ok: !state.loading && !!state.check?.ok };
}

/** Lists only the requirements the package does not meet (nothing when all are met). */
export function PackageRequirements({ state, className }: { state: PackageCheckState; className?: string }) {
  const { t, money } = useApp();
  const r = t.packageRules;
  const L = PACKAGE_LIMITS;
  if (state.loading) return null;
  if (state.error) {
    const msg = (t.review.errors as Record<string, string>)[state.error] ?? t.review.errors.generic;
    return <Alert tone="error" className={className}>{msg}</Alert>;
  }
  const check = state.check;
  if (!check || check.ok) return null;
  const labels: Record<string, string> = {
    duration: fmt(r.items.duration, { min: L.minPackageDays, max: L.maxPackageDays, days: check.days }),
    leadTime: fmt(r.items.leadTime, { min: L.minLeadDays }),
    composition: fmt(r.items.composition, { adults: L.maxAdults, minors: L.maxMinors }),
    flights: r.items.flights,
    hotels: fmt(r.items.hotels, { stars: L.minHotelStars }),
    minPrice: fmt(r.items.minPrice, {
      perAdult: money(L.minPricePerAdultSAR),
      adults: check.adults,
      min: money(check.minPriceSAR),
      total: money(check.totalSAR),
      amount: money(check.shortfallSAR),
    }),
  };
  return (
    <Alert tone="warning" className={cx("space-y-1.5", className)}>
      <p className="font-bold">{r.notMet}</p>
      <ul className="list-disc space-y-1 ps-5">
        {check.checks.filter((c) => !c.ok).map((c) => <li key={c.id}>{labels[c.id]}</li>)}
      </ul>
    </Alert>
  );
}
