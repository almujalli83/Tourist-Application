"use client";

import { useEffect, useState } from "react";
import type { OperatorInfo } from "@/lib/transit/transit";
import type { TransitLine, TransitStop } from "@/lib/transit/types";

const cache = new Map<string, Promise<unknown>>();
function load<T>(url: string, pick: (d: Record<string, unknown>) => T, fallback: T): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : null)).then((d) => (d ? pick(d) : fallback)).catch(() => { cache.delete(url); return fallback; }));
  return cache.get(url) as Promise<T>;
}
function useLoad<T>(url: string | null, pick: (d: Record<string, unknown>) => T, fallback: T): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    load(url, pick, fallback).then((x) => live && setV(x));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return v;
}

/** Cities with public transport in the platform (null while loading). */
export const useTransitOperators = () => useLoad<OperatorInfo[]>("/api/transit/cities", (d) => d.operators as OperatorInfo[], []);
export const useTransitStops = (city: string | null) => useLoad<TransitStop[]>(city ? `/api/transit/stops?city=${city}` : null, (d) => d.stops as TransitStop[], []);
export const useTransitLines = (city: string | null) => useLoad<TransitLine[]>(city ? `/api/transit/lines?city=${city}` : null, (d) => d.lines as TransitLine[], []);
