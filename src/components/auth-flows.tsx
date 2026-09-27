"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { Logo } from "./icons";
import { PasswordInput, PasswordStrength } from "./password-input";
import { Alert, Button, Card, Field, Input, Spinner } from "./ui";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-slate-500">{t.meta.appName}</p>
          </div>
        </div>
        {children}
      </Card>
    </div>
  );
}

const errorText = (errors: Record<string, string>, code: string | undefined, minutes = 0) => fmt(errors[code ?? ""] ?? errors.generic, { minutes });

/** "Forgot your password": sends a reset link by email. */
export function ForgotPassword() {
  const { t, locale } = useApp();
  const a = t.auth;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, locale }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(errorText(a.errors, d.error, d.minutes));
    setSent(true);
  }
  return (
    <Shell title={a.forgotTitle}>
      {sent ? (
        <div className="space-y-4">
          <Alert tone="success"><span data-testid="forgot-sent">{a.forgotSent}</span></Alert>
          <Link href={`/${locale}/login`} className="block text-center text-sm font-semibold text-brand-700 hover:underline">{a.backToLogin}</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-slate-600">{a.forgotIntro}</p>
          <Field label={a.email} required><Input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email" /></Field>
          {err && <Alert tone="error">{err}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={!email.trim()}>{a.sendLink}</Button>
          <Link href={`/${locale}/login`} className="block text-center text-sm font-semibold text-brand-700 hover:underline">{a.backToLogin}</Link>
        </form>
      )}
    </Shell>
  );
}

function ResetInner() {
  const { t, locale, setUser } = useApp();
  const a = t.auth;
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [valid, setValid] = useState<boolean | null>(null);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/auth/password/reset?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((d) => setValid(!!d.valid)).catch(() => setValid(false));
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.a !== pw.b) return setErr(a.mismatch);
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password: pw.a }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      if (d.error === "expired") setValid(false);
      return setErr(errorText(a.errors, d.error, d.minutes));
    }
    // With two-step verification the second step is done on the sign-in page.
    if (d.mfa) return router.push(`/${locale}/login`);
    setUser(d.user);
    router.push(`/${locale}/account`);
    router.refresh();
  }
  if (valid === null) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  if (!valid) {
    return (
      <div className="space-y-4">
        <Alert tone="error"><span data-testid="reset-invalid">{a.resetInvalid}</span></Alert>
        <Link href={`/${locale}/forgot-password`} className="block text-center text-sm font-semibold text-brand-700 hover:underline">{a.requestNew}</Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={a.newPassword} required hint={a.passwordHint}>
        <PasswordInput autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} data-testid="reset-password" />
        <PasswordStrength value={pw.a} />
      </Field>
      <Field label={a.confirmPassword} required>
        <PasswordInput autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} data-testid="reset-confirm" />
      </Field>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" className="w-full" loading={busy} disabled={!pw.a || !pw.b}>{a.savePassword}</Button>
    </form>
  );
}

export function ResetPassword() {
  const { t } = useApp();
  return <Shell title={t.auth.resetTitle}><Suspense><ResetInner /></Suspense></Shell>;
}

function VerifyInner() {
  const { t, locale, user } = useApp();
  const a = t.auth;
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"busy" | "verified" | "changed" | "failed">("busy");
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return; // the link works once
    done.current = true;
    fetch("/api/auth/email/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        setState(r.ok ? d.result : "failed");
      })
      .catch(() => setState("failed"));
  }, [token]);
  if (state === "busy") return <div className="flex items-center gap-2 text-sm text-slate-600"><Spinner className="size-4" />{a.verifying}</div>;
  return (
    <div className="space-y-4" data-testid="verify-result" data-state={state}>
      <Alert tone={state === "failed" ? "error" : "success"}>{state === "verified" ? a.verified : state === "changed" ? a.emailChanged : a.verifyFailed}</Alert>
      <Link href={user ? `/${locale}/account/security` : `/${locale}/login`} className="block text-center text-sm font-semibold text-brand-700 hover:underline">{user ? a.toAccount : a.backToLogin}</Link>
    </div>
  );
}

export function VerifyEmail() {
  const { t } = useApp();
  return <Shell title={t.auth.verifyTitle}><Suspense><VerifyInner /></Suspense></Shell>;
}
