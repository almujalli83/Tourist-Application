/**
 * Payment gateway (PSP) adapter. One licensed Saudi gateway is linked through PAYMENT_GATEWAY
 * (JSON), for example:
 *   { "id": "moyasar", "url": "https://api.gateway.sa/v1", "secretKey": "sk_…", "publishableKey": "pk_…",
 *     "tokenizeUrl": "https://api.gateway.sa/v1/tokens", "applePayMerchantId": "merchant.sa.saudi-trip",
 *     "googlePayMerchantId": "…", "stcPay": true }
 * Expected endpoints (to be matched with the gateway's specification):
 *   POST {url}/payments                 { amount (halalas), currency: "SAR", description, source, callbackUrl, metadata }
 *                                       → { id, status: "authorized" | "paid" | "initiated" | "failed", source: { company, last4, token? }, transactionUrl? }
 *   GET  {url}/payments/{id}            → same shape
 *   POST {url}/payments/{id}/capture    { amount }
 *   POST {url}/payments/{id}/void
 *   POST {url}/payments/{id}/refund     { amount } → { id }
 *   POST {url}/payments/{id}/otp        { otp }            (STC Pay)
 *   POST {url}/applepay/session         { validationUrl, displayName, domain } → merchant session
 * Sandbox (no gateway): approves test cards; cards ending 1091 ask for 3-D Secure; ending 0002
 * are declined; Apple Pay / Google Pay sample tokens; STC Pay OTP 123456.
 */
import { randomUUID } from "node:crypto";
import { cardBrand, luhn } from "../payment";
import type { PayConfig, PaySource } from "./types";

interface GatewayConfig { id: string; url: string; secretKey: string; publishableKey?: string; tokenizeUrl?: string; applePayMerchantId?: string; googlePayMerchantId?: string; stcPay?: boolean }

export function gatewayConfig(): GatewayConfig | null {
  try {
    const c = JSON.parse(process.env.PAYMENT_GATEWAY ?? "null") as GatewayConfig | null;
    return c && typeof c.url === "string" && typeof c.secretKey === "string" ? { ...c, id: c.id || "gateway" } : null;
  } catch {
    return null;
  }
}

export function payConfig(): PayConfig {
  const c = gatewayConfig();
  if (!c) return { sandbox: true, gateway: "sandbox", tokenizeUrl: null, publishableKey: null, applePay: { merchantId: "merchant.sandbox" }, googlePay: { merchantId: "sandbox", gatewayId: "sandbox" }, stcPay: true };
  return {
    sandbox: false, gateway: c.id, tokenizeUrl: c.tokenizeUrl ?? null, publishableKey: c.publishableKey ?? null,
    applePay: c.applePayMerchantId ? { merchantId: c.applePayMerchantId } : null,
    googlePay: c.googlePayMerchantId ? { merchantId: c.googlePayMerchantId, gatewayId: c.id } : null,
    stcPay: c.stcPay === true,
  };
}

export class GatewayError extends Error {
  constructor(public code: "unavailable" | "declined" | "invalid_card" | "expired" | "authentication_required" | "invalid_otp") {
    super(code);
  }
}

export interface GatewayPayment {
  ref: string;
  status: "requires_action" | "authorized" | "failed";
  brand: string;
  last4: string;
  /** Gateway token of the card (when the traveller chose to save it). */
  cardToken: string | null;
  actionUrl: string | null;
  error: string | null;
}

export interface Gateway {
  sandbox: boolean;
  create(r: { amountSAR: number; description: string; source: PaySource & { savedToken?: string }; callbackUrl: string; intentId: string; save: boolean }): Promise<GatewayPayment>;
  fetch(ref: string): Promise<GatewayPayment>;
  otp(ref: string, otp: string): Promise<GatewayPayment>;
  capture(ref: string, amountSAR: number): Promise<void>;
  void(ref: string): Promise<void>;
  refund(ref: string, amountSAR: number): Promise<{ refundId: string }>;
  applePaySession(validationUrl: string, domain: string): Promise<unknown>;
}

/* ------------------------------------------------------------------ API */

function apiGateway(c: GatewayConfig): Gateway {
  const base = c.url.replace(/\/$/, "");
  const call = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { accept: "application/json", "content-type": "application/json", authorization: `Basic ${Buffer.from(`${c.secretKey}:`).toString("base64")}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new GatewayError("unavailable");
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.status === 402 || (res.status >= 400 && res.status < 500)) throw new GatewayError("declined");
    if (!res.ok) throw new GatewayError("unavailable");
    return body;
  };
  const map = (b: Record<string, unknown> | null): GatewayPayment => {
    if (!b || typeof b.id !== "string") throw new GatewayError("unavailable");
    const src = (b.source ?? {}) as Record<string, unknown>;
    const st = String(b.status);
    return {
      ref: b.id, status: st === "authorized" || st === "paid" || st === "captured" ? "authorized" : st === "initiated" ? "requires_action" : "failed",
      brand: String(src.company ?? src.brand ?? src.type ?? "card"), last4: String(src.last4 ?? src.number ?? "").slice(-4),
      cardToken: typeof src.token === "string" ? src.token : null, actionUrl: typeof src.transaction_url === "string" ? src.transaction_url : typeof b.transactionUrl === "string" ? b.transactionUrl : null,
      error: typeof src.message === "string" && st === "failed" ? src.message : null,
    };
  };
  return {
    sandbox: false,
    async create(r) {
      if (r.source.type === "card") throw new GatewayError("authentication_required"); // raw cards are tokenized in the browser
      const source = r.source.type === "saved" ? { type: "token", token: r.source.savedToken, cvc: r.source.cvc } : r.source.type === "token" ? { type: "token", token: r.source.token } : r.source;
      return map(await call("/payments", { method: "POST", body: JSON.stringify({ amount: Math.round(r.amountSAR * 100), currency: "SAR", description: r.description, source, callback_url: r.callbackUrl, metadata: { intent: r.intentId }, save_card: r.save }) }));
    },
    async fetch(ref) {
      return map(await call(`/payments/${encodeURIComponent(ref)}`));
    },
    async otp(ref, otp) {
      try {
        return map(await call(`/payments/${encodeURIComponent(ref)}/otp`, { method: "POST", body: JSON.stringify({ otp }) }));
      } catch (e) {
        throw e instanceof GatewayError && e.code === "declined" ? new GatewayError("invalid_otp") : e;
      }
    },
    async capture(ref, amountSAR) {
      await call(`/payments/${encodeURIComponent(ref)}/capture`, { method: "POST", body: JSON.stringify({ amount: Math.round(amountSAR * 100) }) });
    },
    async void(ref) {
      await call(`/payments/${encodeURIComponent(ref)}/void`, { method: "POST" });
    },
    async refund(ref, amountSAR) {
      const b = await call(`/payments/${encodeURIComponent(ref)}/refund`, { method: "POST", body: JSON.stringify({ amount: Math.round(amountSAR * 100) }) });
      return { refundId: String((b as { id?: unknown } | null)?.id ?? `RFD-${randomUUID()}`) };
    },
    async applePaySession(validationUrl, domain) {
      return call("/applepay/session", { method: "POST", body: JSON.stringify({ validationUrl, displayName: "Saudi Trip", domain }) });
    },
  };
}

/* -------------------------------------------------------------- sandbox */

export const SANDBOX_OTP = "123456";

const sandboxGateway: Gateway = {
  sandbox: true,
  async create(r) {
    const ref = `SBX-${randomUUID()}`;
    const s = r.source;
    if (s.type === "card") {
      const num = s.number.replace(/\D/g, "");
      if (!luhn(num) || !/^\d{3,4}$/.test(s.cvc) || !s.holder.trim()) throw new GatewayError("invalid_card");
      const month = Number(s.expMonth);
      const year = 2000 + (Number(s.expYear) % 100);
      if (!(month >= 1 && month <= 12) || new Date(Date.UTC(year, month, 1)) <= new Date()) throw new GatewayError("expired");
      if (num.endsWith("0002")) throw new GatewayError("declined");
      const challenge = num.endsWith("1091");
      return { ref, status: challenge ? "requires_action" : "authorized", brand: cardBrand(num), last4: num.slice(-4), cardToken: r.save ? `tok_sbx_${randomUUID()}` : null, actionUrl: challenge ? `/pay/3ds/${r.intentId}` : null, error: null };
    }
    if (s.type === "saved") {
      if (!/^\d{3,4}$/.test(s.cvc) || !s.savedToken) throw new GatewayError("invalid_card");
      return { ref, status: "authorized", brand: "card", last4: "", cardToken: null, actionUrl: null, error: null };
    }
    if (s.type === "token") return { ref, status: "authorized", brand: "card", last4: "", cardToken: s.save ? s.token : null, actionUrl: null, error: null };
    if (s.type === "applepay" || s.type === "googlepay") {
      if (s.token !== `sandbox-${s.type}`) throw new GatewayError("declined");
      return { ref, status: "authorized", brand: s.type, last4: "", cardToken: null, actionUrl: null, error: null };
    }
    if (!/^(\+?966|0)?5\d{8}$/.test(s.mobile.replace(/\s/g, ""))) throw new GatewayError("invalid_card");
    return { ref, status: "requires_action", brand: "stcpay", last4: s.mobile.replace(/\D/g, "").slice(-4), cardToken: null, actionUrl: null, error: null };
  },
  async fetch() {
    // The sandbox keeps no state of its own: the intent record is the source of truth.
    throw new GatewayError("unavailable");
  },
  async otp(ref, otp) {
    if (otp !== SANDBOX_OTP) throw new GatewayError("invalid_otp");
    return { ref, status: "authorized", brand: "stcpay", last4: "", cardToken: null, actionUrl: null, error: null };
  },
  async capture() {},
  async void() {},
  async refund() {
    return { refundId: `RFD-${randomUUID()}` };
  },
  async applePaySession() {
    return { sandbox: true };
  },
};

export const gateway = (): Gateway => {
  const c = gatewayConfig();
  return c ? apiGateway(c) : sandboxGateway;
};
