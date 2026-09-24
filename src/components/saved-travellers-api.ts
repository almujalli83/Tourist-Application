"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedTraveller, SavedTravellerData, SavedTravellerSummary } from "@/lib/saved-travellers";

export class SaveTravellerError extends Error {
  constructor(public code: string, public fieldErrors?: Record<string, string>) {
    super(code);
  }
}

/** The signed-in user's saved travellers (empty and idle when `enabled` is false). */
export function useSavedTravellers(enabled: boolean) {
  const [list, setList] = useState<SavedTravellerSummary[]>([]);
  const [loading, setLoading] = useState(enabled);
  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const res = await fetch("/api/travellers", { cache: "no-store" });
      if (res.ok) setList((await res.json()).travellers);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (enabled) void reload();
    else setList([]);
  }, [enabled, reload]);
  return { list, loading, reload };
}

export async function fetchSavedTraveller(id: string): Promise<SavedTraveller> {
  const res = await fetch(`/api/travellers/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw new SaveTravellerError("load");
  return (await res.json()).traveller;
}

/** Creates (no id) or updates a saved traveller. */
export async function saveTraveller(data: SavedTravellerData, id?: string | null): Promise<SavedTravellerSummary> {
  const res = await fetch(id ? `/api/travellers/${encodeURIComponent(id)}` : "/api/travellers", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new SaveTravellerError(body.error ?? "generic", body.details);
  return body.traveller;
}

export async function deleteSavedTraveller(id: string): Promise<void> {
  const res = await fetch(`/api/travellers/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new SaveTravellerError("generic");
}
