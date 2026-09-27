/**
 * Live exchange rates (units per 1 SAR), linked to a rates provider and refreshed twice a day.
 * Default source: the free open ExchangeRate-API endpoint with SAR as base (FX_RATES_URL overrides;
 * a Frankfurter / ECB-style { base, rates } answer is accepted too, converted through the fixed
 * SAR/USD peg of 3.75). The last rates are kept; the built-in rates are the fallback.
 */
import { CURRENCIES } from "./currency";
import { store } from "./store";

export const DEFAULT_FX_URL = "https://open.er-api.com/v6/latest/SAR";
/** The riyal is pegged to the US dollar. */
export const SAR_PER_USD = 3.75;
const REFRESH_MS = 12 * 3_600_000;
const DOC = "fxRates";

export interface FxRates { rates: Record<string, number>; updatedAt: string | null; source: string; live: boolean }
type Kept = FxRates & { id: string; url: string };

/** Units per 1 SAR from a provider answer. */
export function parseRates(data: unknown): Record<string, number> | null {
  const d = data as { base?: string; base_code?: string; rates?: Record<string, unknown>; conversion_rates?: Record<string, unknown> } | null;
  const raw = d?.rates ?? d?.conversion_rates;
  if (!raw || typeof raw !== "object") return null;
  const base = String(d?.base_code ?? d?.base ?? "SAR").toUpperCase();
  const num = Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  num[base] ??= 1; // the base currency itself
  let perSAR: Record<string, number>;
  if (base === "SAR") perSAR = num;
  else if (num.SAR) perSAR = Object.fromEntries(Object.entries(num).map(([k, v]) => [k, v / num.SAR]));
  else if (base === "USD") perSAR = Object.fromEntries(Object.entries(num).map(([k, v]) => [k, v / SAR_PER_USD]));
  else if (num.USD) perSAR = Object.fromEntries(Object.entries(num).map(([k, v]) => [k, v / num.USD / SAR_PER_USD]));
  else return null;
  perSAR.SAR = 1;
  // Only the currencies the platform offers, and only sane values (a bad feed must not break prices).
  const out: Record<string, number> = {};
  for (const c of CURRENCIES) {
    const v = perSAR[c.code];
    if (v && Number.isFinite(v) && v > c.perSAR / 5 && v < c.perSAR * 5) out[c.code] = v;
  }
  return Object.keys(out).length >= 3 ? out : null;
}

const fxUrl = () => process.env.FX_RATES_URL?.trim() || DEFAULT_FX_URL;
let memo: { at: number; fx: FxRates } | null = null;

export async function refreshRates(now = new Date()): Promise<FxRates> {
  const url = fxUrl();
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`fx ${res.status}`);
  const rates = parseRates(await res.json());
  if (!rates) throw new Error("fx: no rates");
  const fx: FxRates = { rates, updatedAt: now.toISOString(), source: new URL(url).hostname, live: true };
  await store().put("config", DOC, { id: DOC, url, ...fx } satisfies Kept);
  return fx;
}

/** The current rates: kept (refreshed when older than 12 h), else the built-in ones. */
export async function getRates(now = new Date()): Promise<FxRates> {
  if (memo && now.getTime() - memo.at < 10 * 60_000) return memo.fx;
  const kept = await store().get<Kept>("config", DOC);
  let fx: FxRates | null = kept ? { rates: kept.rates, updatedAt: kept.updatedAt, source: kept.source, live: true } : null;
  if (!fx || now.getTime() - Date.parse(fx.updatedAt ?? "") > REFRESH_MS) {
    try {
      fx = await refreshRates(now);
    } catch {
      /* unreachable: keep what we have */
    }
  }
  fx ??= { rates: Object.fromEntries(CURRENCIES.map((c) => [c.code, c.perSAR])), updatedAt: null, source: "built-in", live: false };
  memo = { at: now.getTime(), fx };
  return fx;
}

export const resetFxCache = () => {
  memo = null;
};
