"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import type { PublicUser } from "@/lib/auth/types";
import { useApp } from "./app-provider";
import { PhoneIcon, ShieldIcon } from "./icons";
import { PhoneInput } from "./phone-input";
import { Alert, Badge, Button, Field, Input, Spinner } from "./ui";

export type Outcome = { status: "ok"; user: PublicUser } | { status: "mfa"; ticket: string } | { status: "signup"; ticket: string } | { status: "linked" };
type Modes = { google: "live" | "sandbox" | null; apple: "live" | "sandbox" | null; nafath: "live" | "sandbox" | null; phone: "live" | "sandbox" };

export const GoogleMark = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23z" /><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.2a11 11 0 0 0 0 9.9z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4z" /></svg>
);
export const AppleMark = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="currentColor"><path d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8s2.3-1.3 3.1-2.5c1-1.4 1.4-2.8 1.4-2.9-.1 0-2.6-1-2.6-4.1zM13.9 5c.7-.8 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" /></svg>
);

async function post(url: string, data: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
}

/** Other ways to sign in (or to link, from Account security): mobile number, Google, Apple, Nafath. */
export function OtherSignIn({ onDone, mode = "login", next, remember = true }: { onDone: (o: Outcome) => void; mode?: "login" | "link"; next?: string; remember?: boolean }) {
  const { t, locale } = useApp();
  const a = t.auth;
  const [modes, setModes] = useState<Modes | null>(null);
  const [panel, setPanel] = useState<"phone" | "nafath" | null>(null);
  useEffect(() => {
    fetch("/api/auth/providers").then((r) => r.json()).then(setModes).catch(() => undefined);
  }, []);
  if (!modes) return null;
  const href = (p: "google" | "apple") => `/api/auth/oauth/${p}/start?locale=${locale}&mode=${mode}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  const sbx = (m: string | null) => m === "sandbox" && <Badge tone="amber" className="ms-auto">{a.sandboxBadge}</Badge>;
  const btn = "flex h-11 w-full items-center gap-3 rounded-lg bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-slate-300 hover:bg-slate-50";

  if (panel === "phone") return <PhoneSignIn sandbox={modes.phone === "sandbox"} onDone={onDone} onBack={() => setPanel(null)} remember={remember} />;
  if (panel === "nafath") return <NafathSignIn sandbox={modes.nafath === "sandbox"} onDone={onDone} onBack={() => setPanel(null)} mode={mode} />;
  return (
    <div className="space-y-2" data-testid="other-signin">
      {mode === "login" && (
        <button type="button" className={btn} onClick={() => setPanel("phone")} data-testid="signin-phone"><PhoneIcon className="size-5 text-brand-700" />{a.withPhone}{sbx(modes.phone)}</button>
      )}
      {modes.google && <a href={href("google")} className={btn} data-testid="signin-google"><GoogleMark />{a.withGoogle}{sbx(modes.google)}</a>}
      {modes.apple && <a href={href("apple")} className={btn} data-testid="signin-apple"><AppleMark />{a.withApple}{sbx(modes.apple)}</a>}
      {modes.nafath && <button type="button" className={btn} onClick={() => setPanel("nafath")} data-testid="signin-nafath"><ShieldIcon className="size-5 text-brand-700" />{a.withNafath}{sbx(modes.nafath)}</button>}
    </div>
  );
}

function PhoneSignIn({ sandbox, onDone, onBack, remember }: { sandbox: boolean; onDone: (o: Outcome) => void; onBack: () => void; remember: boolean }) {
  const { t, locale } = useApp();
  const a = t.auth;
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errText = (d: { error?: string; minutes?: number }) => fmt((a.errors as Record<string, string>)[d.error ?? ""] ?? a.errors.generic, { minutes: d.minutes ?? 0 });
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { ok, d } = await post("/api/auth/otp/send", { phone });
    setBusy(false);
    if (!ok) return setErr(errText(d));
    setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { ok, d } = await post("/api/auth/otp/verify", { phone, code, locale, remember });
    if (!ok) {
      setBusy(false);
      return setErr(errText(d));
    }
    onDone(d as Outcome);
  }
  return (
    <div className="space-y-4" data-testid="phone-signin">
      <div>
        <h2 className="font-bold text-ink">{a.phoneTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{a.phoneIntro}</p>
      </div>
      {!sent ? (
        <form onSubmit={send} className="space-y-3" noValidate>
          <Field label={a.phone}><PhoneInput value={phone} onChange={setPhone} /></Field>
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={phone.length < 8} data-testid="phone-send">{a.sendCode}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3" noValidate>
          <Field label={fmt(a.codeSentTo, { phone })}>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus data-testid="phone-code" />
          </Field>
          {sandbox && <p className="text-xs text-amber-700">{a.sandboxCode}</p>}
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6} data-testid="phone-verify">{a.verify}</Button>
          <button type="button" onClick={() => { setSent(false); setCode(""); setErr(null); }} className="w-full text-sm font-semibold text-brand-700 hover:underline">{a.changeNumber}</button>
        </form>
      )}
      <button type="button" onClick={onBack} className="w-full text-sm font-semibold text-slate-600 hover:underline">{a.cancel}</button>
    </div>
  );
}

export function NafathSignIn({ sandbox, onDone, onBack, mode }: { sandbox: boolean; onDone: (o: Outcome) => void; onBack: () => void; mode: "login" | "link" }) {
  const { t, locale } = useApp();
  const a = t.auth;
  const [id, setId] = useState("");
  const [req, setReq] = useState<{ ticket: string; random: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errText = (d: { error?: string; minutes?: number }) => fmt((a.errors as Record<string, string>)[d.error ?? ""] ?? a.errors.generic, { minutes: d.minutes ?? 0 });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { ok, d } = await post("/api/auth/nafath/start", { nationalId: id, locale, mode });
    setBusy(false);
    if (!ok) return setErr(errText(d));
    setReq(d);
    const poll = async () => {
      const r = await post("/api/auth/nafath/status", { ticket: d.ticket });
      if (!r.ok) {
        setReq(null);
        return setErr(errText(r.d));
      }
      if (r.d.status === "waiting") {
        timer.current = setTimeout(poll, 2000);
        return;
      }
      onDone(r.d as Outcome);
    };
    timer.current = setTimeout(poll, 2000);
  }
  return (
    <div className="space-y-4" data-testid="nafath-signin">
      <div>
        <h2 className="font-bold text-ink">{a.nafathTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{a.nafathIntro}</p>
      </div>
      {!req ? (
        <form onSubmit={start} className="space-y-3" noValidate>
          <Field label={a.nationalId}><Input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, "").slice(0, 10))} dir="ltr" inputMode="numeric" data-testid="nafath-id" /></Field>
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={id.length !== 10} data-testid="nafath-start">{a.nafathStart}</Button>
        </form>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold text-ink">{a.nafathChoose}</p>
          <p className="mx-auto grid size-24 place-items-center rounded-2xl bg-brand-700 text-4xl font-bold text-white tabular-nums" data-testid="nafath-random">{req.random}</p>
          <p className="flex items-center justify-center gap-2 text-sm text-slate-600"><Spinner className="size-4" />{a.nafathWaiting}</p>
          {sandbox && <p className="text-xs text-amber-700">{a.nafathSandbox}</p>}
        </div>
      )}
      <button type="button" onClick={() => { if (timer.current) clearTimeout(timer.current); onBack(); }} className="w-full text-sm font-semibold text-slate-600 hover:underline">{a.cancel}</button>
    </div>
  );
}
