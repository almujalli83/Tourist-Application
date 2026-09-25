/**
 * Traveller notifications by email. Every message is recorded in the "outbox" collection (shown
 * in the back office). With RESEND_API_KEY and EMAIL_FROM set, messages are sent through Resend;
 * otherwise they are only recorded (status "logged").
 */
import { randomUUID } from "node:crypto";
import { store } from "./store";

export type OutboxStatus = "sent" | "failed" | "logged";

export interface OutboxMessage {
  id: string;
  createdAt: string;
  to: string[];
  subject: string;
  text: string;
  bookingId: string | null;
  status: OutboxStatus;
  providerId: string | null;
  error: string | null;
  attempts: number;
}

export const emailConfigured = () => !!(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());

async function deliver(msg: Pick<OutboxMessage, "to" | "subject" | "text">): Promise<{ status: OutboxStatus; providerId: string | null; error: string | null }> {
  if (!emailConfigured()) {
    console.info(`[notify] (no email provider) to=${msg.to.join(",")} subject=${JSON.stringify(msg.subject)}`);
    return { status: "logged", providerId: null, error: null };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM!.trim(), to: msg.to, subject: msg.subject, text: msg.text }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    return res.ok ? { status: "sent", providerId: body.id ?? null, error: null } : { status: "failed", providerId: null, error: body.message ?? `HTTP ${res.status}` };
  } catch (err) {
    return { status: "failed", providerId: null, error: (err as Error).message };
  }
}

/** Emails the travellers and records the message; returns the outbox entry. */
export async function notifyTravellers(
  emails: string[],
  message: { subject: string; text: string },
  meta: { bookingId?: string } = {},
): Promise<OutboxMessage | null> {
  const to = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  if (!to.length) return null;
  const result = await deliver({ to, ...message });
  const entry: OutboxMessage = { id: randomUUID(), createdAt: new Date().toISOString(), to, ...message, bookingId: meta.bookingId ?? null, ...result, attempts: 1 };
  await store().put("outbox", entry.id, entry);
  return entry;
}

/** Sends a recorded message again (back office). */
export async function resendOutbox(id: string): Promise<OutboxMessage | null> {
  const msg = await store().get<OutboxMessage>("outbox", id);
  if (!msg) return null;
  const result = await deliver(msg);
  return store().update<OutboxMessage>("outbox", id, (m) => ({ ...m, ...result, attempts: m.attempts + 1 }));
}

export function listOutbox(limit = 200) {
  return store().list<OutboxMessage>("outbox", limit);
}
