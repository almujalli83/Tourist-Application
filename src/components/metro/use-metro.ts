"use client";

import { useEffect, useState } from "react";
import type { MetroNetwork } from "@/lib/metro/types";

let cached: Promise<MetroNetwork | null> | null = null;

/** The Riyadh Metro network (loaded once per page; null while loading or when unavailable). */
export function useMetro(enabled = true): MetroNetwork | null {
  const [net, setNet] = useState<MetroNetwork | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    cached ??= fetch("/api/metro").then((r) => (r.ok ? (r.json() as Promise<MetroNetwork>) : null)).catch(() => null);
    cached.then((n) => {
      if (!n) cached = null; // try again next time
      if (live) setNet(n);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return net;
}
