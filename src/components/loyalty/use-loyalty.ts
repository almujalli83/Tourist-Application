"use client";

import { useEffect, useState } from "react";
import type { LoyaltyEntry, LoyaltySummary } from "@/lib/loyalty/types";

/** Fired after a purchase or cancellation changes the points (header chip and checkout reload). */
export const LOYALTY_CHANGED = "loyalty:changed";

export interface LoyaltyData {
  summary: LoyaltySummary;
  entries: LoyaltyEntry[];
}

/** The signed-in member's points; null while loading or when signed out. */
export function useLoyalty(enabled = true, deps: unknown[] = []): LoyaltyData | null {
  const [data, setData] = useState<LoyaltyData | null>(null);
  useEffect(() => {
    if (!enabled) return setData(null);
    let alive = true;
    const load = () =>
      fetch("/api/loyalty", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && setData(d))
        .catch(() => undefined);
    load();
    window.addEventListener(LOYALTY_CHANGED, load);
    return () => {
      alive = false;
      window.removeEventListener(LOYALTY_CHANGED, load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return data;
}

export const loyaltyChanged = () => window.dispatchEvent(new Event(LOYALTY_CHANGED));
