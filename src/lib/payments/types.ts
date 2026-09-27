/** Payments: shared types (client-safe). */
export const PAY_METHODS = ["card", "applepay", "googlepay", "stcpay"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

/** What the browser sends to authorize a payment. Raw card numbers go to the gateway's tokenizer in live mode, never to our server. */
export type PaySource =
  | { type: "card"; holder: string; number: string; expMonth: string; expYear: string; cvc: string }
  | { type: "token"; token: string; save?: boolean }
  | { type: "saved"; cardId: string; cvc: string }
  | { type: "applepay"; token: unknown }
  | { type: "googlepay"; token: unknown }
  | { type: "stcpay"; mobile: string };

export type IntentStatus = "requires_action" | "authorized" | "captured" | "failed" | "voided" | "refunded" | "partially_refunded";

export interface IntentView {
  id: string;
  amountSAR: number;
  status: IntentStatus;
  method: PayMethod;
  brand: string;
  last4: string;
  /** 3-D Secure page (iframe) or STC Pay OTP. */
  action: { type: "3ds"; url: string } | { type: "otp" } | null;
  error: string | null;
  sandbox: boolean;
}

export interface SavedCard { id: string; brand: string; last4: string; expMonth: string; expYear: string; createdAt: string }

/** Public payment settings for the checkout. */
export interface PayConfig {
  sandbox: boolean;
  gateway: string;
  /** Live mode: the browser tokenizes cards at the gateway with the publishable key. */
  tokenizeUrl: string | null;
  publishableKey: string | null;
  applePay: { merchantId: string } | null;
  googlePay: { merchantId: string; gatewayId: string } | null;
  stcPay: boolean;
}
