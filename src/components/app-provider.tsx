"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale, UiLang } from "@/i18n/config";
import type { PublicUser } from "@/lib/auth/types";
import { formatMoney, setLiveRates } from "@/lib/currency";

interface AppCtx {
  locale: Locale;
  /** The interface language (Arabic, English, or a translation over the English pages). */
  uiLang: UiLang;
  t: Dictionary;
  currency: string;
  setCurrency: (c: string) => void;
  money: (sar: number) => string;
  /** Exchange rates last update (null: built-in rates). */
  fx: { updatedAt: string | null; source: string; live: boolean } | null;
  user: PublicUser | null;
  setUser: (u: PublicUser | null) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ locale, uiLang, dict, initialCurrency, initialUser, children }: {
  locale: Locale; uiLang: UiLang; dict: Dictionary; initialCurrency: string; initialUser: PublicUser | null; children: ReactNode;
}) {
  const [currency, setCurrencyState] = useState(initialCurrency);
  const [user, setUser] = useState(initialUser);
  const setCurrency = useCallback((c: string) => {
    setCurrencyState(c);
    document.cookie = `ta_currency=${c};path=/;max-age=31536000;samesite=lax`;
  }, []);
  const [fx, setFx] = useState<AppCtx["fx"]>(null);
  // Live exchange rates: the last ones saved on this device first (offline), then the server's.
  useEffect(() => {
    const apply = (d: { rates?: Record<string, number>; updatedAt: string | null; source: string; live: boolean }) => {
      if (d.rates && d.live) setLiveRates(d.rates);
      setFx({ updatedAt: d.updatedAt, source: d.source, live: d.live });
    };
    try {
      const saved = localStorage.getItem("ta_fx");
      if (saved) apply(JSON.parse(saved));
    } catch {
      /* storage unavailable */
    }
    fetch("/api/fx").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      apply(d);
      try {
        if (d.live) localStorage.setItem("ta_fx", JSON.stringify(d));
      } catch {
        /* storage unavailable */
      }
    }).catch(() => undefined);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const money = useCallback((sar: number) => formatMoney(sar, currency, locale), [currency, locale, fx]);
  const value = useMemo(() => ({ locale, uiLang, t: dict, currency, setCurrency, money, fx, user, setUser }), [locale, uiLang, dict, currency, setCurrency, money, fx, user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
