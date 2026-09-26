"use client";

import { useCallback, useEffect, useState } from "react";

/** Prayer-times preferences, kept on this device (the service is optional). */
export interface PrayerSettings {
  /** Show the next prayer on the home page. */
  showHome: boolean;
  /** Alert this many minutes before each prayer (0 = off). */
  alertMins: number;
  source: "gps" | "trip" | "city";
  city: string;
  /** Last location used (for the home card and alerts). */
  loc: { lat: number; lng: number; city: string | null } | null;
}

const KEY = "prayer:settings";
const EVENT = "prayer:settings";
export const DEFAULT_SETTINGS: PrayerSettings = { showHome: false, alertMins: 0, source: "gps", city: "RUH", loc: null };

export function readSettings(): PrayerSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function usePrayerSettings(): [PrayerSettings, (patch: Partial<PrayerSettings>) => void, boolean] {
  const [s, setS] = useState<PrayerSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setS(readSettings());
    setReady(true);
    const sync = () => setS(readSettings());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((patch: Partial<PrayerSettings>) => {
    const next = { ...readSettings(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode: settings last for this page only */
    }
    setS(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [s, update, ready];
}

/** Re-renders every `ms` (countdowns). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
