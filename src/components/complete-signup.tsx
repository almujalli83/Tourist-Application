"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { CountrySelect } from "./booking/country-select";
import { CheckIcon, Logo } from "./icons";
import { PhoneInput } from "./phone-input";
import { Alert, Button, Card, Field, Input, Spinner } from "./ui";

interface Prefill { provider: "google" | "apple" | "nafath" | "phone"; name: string; email: string; phone: string; nationality: string; phoneFixed: boolean }

function Inner() {
  const { t, locale, setUser } = useApp();
  const a = t.auth;
  const router = useRouter();
  const ticket = useSearchParams().get("ticket") ?? "";
  const [p, setP] = useState<Prefill | null | false>(null);
  const [f, setF] = useState({ fullName: "", email: "", phone: "", nationality: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/auth/signup?ticket=${encodeURIComponent(ticket)}`).then(async (r) => {
      if (!r.ok) return setP(false);
      const d = (await r.json()) as Prefill;
      setP(d);
      setF({ fullName: d.name, email: d.email, phone: d.phone, nationality: d.nationality });
    }).catch(() => setP(false));
  }, [ticket]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticket, ...f, locale }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setErr(fmt((a.errors as Record<string, string>)[d.error] ?? a.errors.generic, { minutes: d.minutes ?? 0 }));
    }
    if (d.mfa) return router.push(`/${locale}/login?mfa=${d.ticket}`);
    setUser(d.user);
    router.push(`/${locale}/account`);
    router.refresh();
  }
  if (p === null) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  if (p === false) return <Alert tone="error">{a.errors.expired}</Alert>;
  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-testid="complete-signup">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-800"><CheckIcon className="size-4" />{a.completeVia[p.provider]}</p>
      <p className="text-sm text-slate-600">{a.completeIntro}</p>
      <Field label={a.fullName} required><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} data-testid="cs-name" /></Field>
      <Field label={a.email} required><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="cs-email" /></Field>
      <Field label={a.phone} required>
        {p.phoneFixed ? <Input value={f.phone} disabled dir="ltr" /> : <PhoneInput value={f.phone} defaultCountry={f.nationality || "SA"} onChange={(v) => setF({ ...f, phone: v })} />}
      </Field>
      <Field label={a.nationality}><CountrySelect value={f.nationality} onChange={(v) => setF({ ...f, nationality: v })} /></Field>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" className="w-full" loading={busy} data-testid="cs-submit">{a.createAccount}</Button>
    </form>
  );
}

export function CompleteSignup() {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
      <Card className="p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <Logo className="size-10" />
          <div>
            <h1 className="text-xl font-bold">{t.auth.completeTitle}</h1>
            <p className="text-sm text-slate-500">{t.meta.appName}</p>
          </div>
        </div>
        <Suspense><Inner /></Suspense>
      </Card>
    </div>
  );
}
