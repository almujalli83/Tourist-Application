"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import type { PublicUser } from "@/lib/auth/types";
import { formatMoney } from "@/lib/currency";

interface AppCtx {
  locale: Locale;
  t: Dictionary;
  currency: string;
  setCurrency: (c: string) => void;
  money: (sar: number) => string;
  user: PublicUser | null;
  setUser: (u: PublicUser | null) => void;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ locale, dict, initialCurrency, initialUser, children }: {
  locale: Locale; dict: Dictionary; initialCurrency: string; initialUser: PublicUser | null; children: ReactNode;
}) {
  const [currency, setCurrencyState] = useState(initialCurrency);
  const [user, setUser] = useState(initialUser);
  const setCurrency = useCallback((c: string) => {
    setCurrencyState(c);
    document.cookie = `ta_currency=${c};path=/;max-age=31536000;samesite=lax`;
  }, []);
  const money = useCallback((sar: number) => formatMoney(sar, currency, locale), [currency, locale]);
  const value = useMemo(() => ({ locale, t: dict, currency, setCurrency, money, user, setUser }), [locale, dict, currency, setCurrency, money, user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
