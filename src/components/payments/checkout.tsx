"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { formatIn } from "@/lib/currency";
import type { IntentView, PayConfig, PayMethod, PaySource, SavedCard } from "@/lib/payments/types";
import { useApp } from "../app-provider";
import { LockIcon, XIcon } from "../icons";
import { Alert, Button, cx, Field, Input, Spinner } from "../ui";

/** What an order sends as its payment: the authorized intent. */
export type PaymentRef = { paymentId: string };

let configCache: Promise<PayConfig> | null = null;
const loadConfig = () => (configCache ??= fetch("/api/payments/config").then((r) => r.json() as Promise<PayConfig>).catch(() => { configCache = null; return { sandbox: true } as PayConfig; }));

declare global {
  interface Window {
    ApplePaySession?: { new (v: number, req: unknown): ApplePaySessionLike; canMakePayments(): boolean; STATUS_SUCCESS: number; STATUS_FAILURE: number };
  }
}
interface ApplePaySessionLike {
  onvalidatemerchant: (e: { validationURL: string }) => void;
  onpaymentauthorized: (e: { payment: { token: unknown } }) => void;
  oncancel: () => void;
  completeMerchantValidation(s: unknown): void;
  completePayment(status: number): void;
  begin(): void;
  abort(): void;
}

const waitFor = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The checkout used by every service: saved cards, a new card (mada / Visa / Mastercard) with 3-D
 * Secure, Apple Pay, Google Pay and STC Pay. It authorizes the amount, then hands the order the
 * payment reference; if the order fails, the authorization is released.
 */
export function Checkout({ amountSAR, description, disabled, onPay, label, guard, testId = "checkout" }: {
  amountSAR: number;
  description: string;
  disabled?: boolean;
  /** Checked before anything is charged (e.g. shows what is missing); false stops the payment. */
  guard?: () => boolean;
  /** Places the order with the payment (undefined when nothing is left to pay); returns true when the order succeeded. */
  onPay: (payment: PaymentRef | undefined) => Promise<boolean>;
  label?: string;
  testId?: string;
}) {
  const { t, money, user, currency, locale } = useApp();
  const p = t.pay;
  const [cfg, setCfg] = useState<PayConfig | null>(null);
  const [method, setMethod] = useState<PayMethod>("card");
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [cvc, setCvc] = useState("");
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [save, setSave] = useState(false);
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [intent, setIntent] = useState<IntentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  const cancelled = useRef(false);
  const errText = (c?: string) => (p.errors as Record<string, string>)[c ?? ""] ?? p.errors.generic;

  useEffect(() => {
    loadConfig().then(setCfg);
    setApple(!!window.ApplePaySession?.canMakePayments?.());
  }, []);
  const loadCards = useCallback(() => {
    if (!user) return;
    fetch("/api/payments/cards", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { cards: [] })).then((d) => {
      setCards(d.cards);
      setSavedId((cur) => cur ?? d.cards[0]?.id ?? null);
    }).catch(() => undefined);
  }, [user]);
  useEffect(loadCards, [loadCards]);

  const methods: PayMethod[] = cfg
    ? (["card", ...(cfg.applePay && (apple || cfg.sandbox) ? ["applepay" as const] : []), ...(cfg.googlePay ? ["googlepay" as const] : []), ...(cfg.stcPay ? ["stcpay" as const] : [])] as PayMethod[])
    : ["card"];

  /** Hands the authorized payment to the order; releases it if the order fails. */
  async function finish(i: IntentView) {
    setIntent(null);
    const ok = await onPay({ paymentId: i.id }).catch(() => false);
    if (!ok) await fetch(`/api/payments/intents/${i.id}`, { method: "DELETE" }).catch(() => undefined);
    else {
      setCard({ holder: "", number: "", exp: "", cvc: "" });
      setCvc("");
      loadCards();
    }
    setBusy(false);
  }

  async function poll(id: string) {
    for (let k = 0; k < 150 && !cancelled.current; k++) {
      await waitFor(2000);
      const r = await fetch(`/api/payments/intents/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      const i = r?.intent as IntentView | undefined;
      if (!i || i.status === "requires_action") continue;
      if (i.status === "authorized") return finish(i);
      setIntent(null);
      setErr(errText(i.error ?? "declined"));
      setBusy(false);
      return;
    }
  }

  async function authorize(source: PaySource) {
    setErr(null);
    setBusy(true);
    cancelled.current = false;
    const r = await fetch("/api/payments/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountSAR, description, source, save: save && (source.type === "card" || source.type === "token") }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setErr(errText(d?.error));
      setBusy(false);
      return null;
    }
    const i = d.intent as IntentView;
    if (i.status === "authorized") {
      await finish(i);
      return i;
    }
    setIntent(i);
    if (i.action?.type === "3ds") void poll(i.id);
    else setBusy(false); // STC Pay: waiting for the traveller's code
    return i;
  }

  async function payCard() {
    if (savedId && method === "card" && cards.some((c) => c.id === savedId)) return authorize({ type: "saved", cardId: savedId, cvc });
    const { expMonth, expYear } = parseExpiry(card.exp);
    const raw = { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc };
    if (cfg && !cfg.sandbox && cfg.tokenizeUrl && cfg.publishableKey) {
      // Live: the card goes to the gateway's tokenizer, never to our server.
      setBusy(true);
      const r = await fetch(cfg.tokenizeUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ publishable_api_key: cfg.publishableKey, name: raw.holder, number: raw.number, month: raw.expMonth, year: raw.expYear, cvc: raw.cvc, save_only: false }) }).catch(() => null);
      const d = await r?.json().catch(() => null);
      if (!r?.ok || typeof d?.id !== "string") {
        setErr(errText("invalid_card"));
        setBusy(false);
        return;
      }
      return authorize({ type: "token", token: d.id, save });
    }
    return authorize({ type: "card", ...raw });
  }

  function payApple() {
    if (cfg?.sandbox || !window.ApplePaySession) return void authorize({ type: "applepay", token: "sandbox-applepay" });
    const session = new window.ApplePaySession(3, {
      countryCode: "SA", currencyCode: "SAR", supportedNetworks: ["mada", "visa", "masterCard"], merchantCapabilities: ["supports3DS"],
      total: { label: "Saudi Trip", amount: amountSAR.toFixed(2) },
    });
    session.onvalidatemerchant = async (e) => {
      const r = await fetch("/api/payments/applepay/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ validationUrl: e.validationURL }) }).then((x) => x.json()).catch(() => null);
      if (r?.session) session.completeMerchantValidation(r.session);
      else session.abort();
    };
    session.onpaymentauthorized = async (e) => {
      const i = await authorize({ type: "applepay", token: e.payment.token });
      session.completePayment(i ? window.ApplePaySession!.STATUS_SUCCESS : window.ApplePaySession!.STATUS_FAILURE);
    };
    session.oncancel = () => setBusy(false);
    session.begin();
  }

  async function payGoogle() {
    if (cfg?.sandbox || !cfg?.googlePay) return void authorize({ type: "googlepay", token: "sandbox-googlepay" });
    const g = await loadGooglePay().catch(() => null);
    if (!g) return setErr(errText("gateway_unavailable"));
    const client = new g.payments.api.PaymentsClient({ environment: "PRODUCTION" });
    try {
      const data = await client.loadPaymentData({
        apiVersion: 2, apiVersionMinor: 0, merchantInfo: { merchantId: cfg.googlePay.merchantId, merchantName: "Saudi Trip" },
        allowedPaymentMethods: [{ type: "CARD", parameters: { allowedAuthMethods: ["PAN_ONLY", "CRYPTOGRAM_3DS"], allowedCardNetworks: ["VISA", "MASTERCARD"] }, tokenizationSpecification: { type: "PAYMENT_GATEWAY", parameters: { gateway: cfg.googlePay.gatewayId, gatewayMerchantId: cfg.googlePay.merchantId } } }],
        transactionInfo: { totalPriceStatus: "FINAL", totalPrice: amountSAR.toFixed(2), currencyCode: "SAR", countryCode: "SA" },
      });
      await authorize({ type: "googlepay", token: data.paymentMethodData.tokenizationData.token });
    } catch {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (!intent) return;
    setBusy(true);
    const r = await fetch(`/api/payments/intents/${intent.id}/otp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ otp }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (!r?.ok) {
      setErr(errText(d?.error));
      setBusy(false);
      return;
    }
    if (d.intent.status === "authorized") return finish(d.intent);
    setErr(errText(d.intent.error ?? "declined"));
    setIntent(null);
    setBusy(false);
  }

  function pay() {
    if (guard && !guard()) return;
    if (!(amountSAR > 0)) {
      setBusy(true);
      void onPay(undefined).finally(() => setBusy(false));
      return;
    }
    if (method === "card") return void payCard();
    if (method === "applepay") return payApple();
    if (method === "googlepay") return void payGoogle();
    return void authorize({ type: "stcpay", mobile });
  }

  const payLabel = label ?? (amountSAR > 0 ? fmt(p.pay, { amount: money(amountSAR) }) : p.confirm);
  const usingSaved = method === "card" && !!savedId && cards.some((c) => c.id === savedId);
  const ready = amountSAR <= 0 || (method === "card" ? (usingSaved ? /^\d{3,4}$/.test(cvc) : !!card.holder && card.number.replace(/\s/g, "").length >= 12 && !!card.exp && card.cvc.length >= 3) : method === "stcpay" ? mobile.replace(/\D/g, "").length >= 9 : true);

  return (
    <div className="space-y-3" data-testid={testId}>
      {amountSAR > 0 && (
        <>
          {methods.length > 1 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
              {methods.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} data-testid={`pay-method-${m}`}
                  className={cx("h-11 rounded-lg px-2 text-xs font-bold ring-1", method === m ? (m === "applepay" || m === "googlepay" ? "bg-black text-white ring-black" : "bg-brand-50 text-brand-800 ring-2 ring-brand-600") : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-500")}>
                  {m === "card" ? "💳 " : ""}{m === "card" ? p.methods.card.split(" (")[0] : p.methods[m]}
                </button>
              ))}
            </div>
          )}
          {method === "card" && (
            <div className="space-y-3">
              {cards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-600">{p.savedCards}</p>
                  {cards.map((c) => (
                    <label key={c.id} className={cx("flex items-center gap-3 rounded-lg p-2.5 ring-1", savedId === c.id ? "ring-2 ring-brand-600" : "ring-slate-200")} data-testid="saved-card">
                      <input type="radio" name={`${testId}-saved`} checked={savedId === c.id} onChange={() => setSavedId(c.id)} className="accent-brand-700" />
                      <span className="flex-1 text-sm font-semibold uppercase" dir="ltr">{c.brand} •••• {c.last4} <span className="text-xs font-normal text-slate-500">{c.expMonth}/{c.expYear}</span></span>
                      <button type="button" className="text-xs text-red-700 hover:underline" onClick={async (e) => { e.preventDefault(); await fetch(`/api/payments/cards/${c.id}`, { method: "DELETE" }); if (savedId === c.id) setSavedId(null); loadCards(); }}>{p.removeCard}</button>
                    </label>
                  ))}
                  <label className={cx("flex items-center gap-3 rounded-lg p-2.5 text-sm font-semibold ring-1", !usingSaved ? "ring-2 ring-brand-600" : "ring-slate-200")}>
                    <input type="radio" name={`${testId}-saved`} checked={!usingSaved} onChange={() => setSavedId("")} className="accent-brand-700" data-testid="new-card" />{p.newCard}
                  </label>
                </div>
              )}
              {usingSaved ? (
                <Field label={p.cvc}><Input dir="ltr" inputMode="numeric" type="password" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-28" data-testid="saved-cvc" /></Field>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t.review.cardHolder} required><Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(x) => setCard({ ...card, holder: x.target.value })} data-testid="card-holder" /></Field>
                    <Field label={t.review.cardNumber} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(x) => setCard({ ...card, number: x.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} data-testid="card-number" /></Field>
                    <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(x) => setCard({ ...card, exp: formatExpiryInput(x.target.value).slice(0, 7) })} data-testid="card-exp" /></Field>
                    <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(x) => setCard({ ...card, cvc: x.target.value.replace(/\D/g, "").slice(0, 4) })} data-testid="card-cvc" /></Field>
                  </div>
                  {user && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-brand-700" data-testid="save-card" />{p.saveCard}</label>}
                </>
              )}
            </div>
          )}
          {(method === "applepay" || method === "googlepay") && <p className="text-sm text-slate-600">{p.walletHint}</p>}
          {method === "stcpay" && !intent && (
            <Field label={p.stcMobile}><Input dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} data-testid="stc-mobile" /></Field>
          )}
          {intent?.action?.type === "otp" && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3" data-testid="stc-otp">
              <Field label={p.otp} hint={cfg?.sandbox ? p.otpSandbox : p.otpHint}><Input dir="ltr" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} className="w-40" data-testid="stc-otp-input" /></Field>
              <Button size="sm" loading={busy} onClick={() => void sendOtp()} disabled={otp.length < 4} data-testid="stc-otp-send">{p.confirm}</Button>
            </div>
          )}
        </>
      )}
      {err && <Alert tone="error"><span data-testid={`${testId}-error`}>{err}</span></Alert>}
      {!intent?.action && (
        <Button className="w-full sm:w-auto" loading={busy} disabled={disabled || !ready} onClick={pay} data-testid={`${testId}-pay`}>
          {method === "applepay" && amountSAR > 0 ? `${p.methods.applepay} · ${money(amountSAR)}` : method === "googlepay" && amountSAR > 0 ? `${p.methods.googlepay} · ${money(amountSAR)}` : method === "stcpay" && amountSAR > 0 ? p.stcSend : payLabel}
        </Button>
      )}
      {amountSAR > 0 && (
        <div className="space-y-1 text-[11px] text-slate-500">
          <p className="flex items-center gap-1"><LockIcon className="size-3.5" />{p.secure}</p>
          {currency !== "SAR" && <p className="font-semibold text-slate-700" data-testid={`${testId}-sar`}>{fmt(t.money.charged, { amount: formatIn(amountSAR, "SAR", locale) })}</p>}
          <p>{p.currency}</p>
          {cfg?.sandbox && <p className="font-semibold text-amber-700">{p.sandbox}</p>}
        </div>
      )}
      {intent?.action?.type === "3ds" && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={p.threeDsTitle}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <p className="font-bold">{p.threeDsTitle}</p>
              <button type="button" onClick={() => { cancelled.current = true; void fetch(`/api/payments/intents/${intent.id}`, { method: "DELETE" }); setIntent(null); setBusy(false); }} aria-label={t.common.cancel}><XIcon className="size-5" /></button>
            </div>
            <iframe src={intent.action.url} title={p.threeDsTitle} className="h-[420px] w-full" data-testid="three-ds-frame" />
            <p className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500"><Spinner className="size-3.5" />{p.threeDsHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// Google Pay's library, loaded only when a live Google Pay payment starts.
interface GooglePayLib { payments: { api: { PaymentsClient: new (o: unknown) => { loadPaymentData(r: unknown): Promise<{ paymentMethodData: { tokenizationData: { token: string } } }> } } } }
function loadGooglePay(): Promise<GooglePayLib> {
  const w = window as unknown as { google?: GooglePayLib };
  if (w.google?.payments) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://pay.google.com/gp/p/js/pay.js";
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("google pay")));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
