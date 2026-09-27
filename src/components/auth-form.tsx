"use client";

import Link from "next/link";
import { useState } from "react";
import { fmt } from "@/i18n";
import type { PublicUser } from "@/lib/auth/types";
import { useApp } from "./app-provider";
import { PhoneInput, phoneHint } from "./phone-input";
import { CountrySelect } from "./booking/country-select";
import { BuildingIcon, UserIcon } from "./icons";
import { PasswordInput, PasswordStrength } from "./password-input";
import { Alert, Button, cx, Field, Input } from "./ui";

export function AuthForm({ initialMode = "login", onSuccess, compact, referralCode = "" }: {
  initialMode?: "login" | "register"; onSuccess: (u: PublicUser) => void; compact?: boolean;
  /** From an invitation link (`?ref=`): the loyalty programme's referral code. */
  referralCode?: string;
}) {
  const { t, locale, setUser } = useApp();
  const a = t.auth;
  const [mode, setMode] = useState(initialMode);
  const [accountType, setAccountType] = useState<"individual" | "company">("individual");
  const [f, setF] = useState({
    email: "", password: "", fullName: "", phone: "", nationality: "",
    companyName: "", commercialRegNo: "", tourismLicenseNo: "", vatNo: "", contactPerson: "", city: "", referralCode,
  });
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mfa, setMfa] = useState<{ ticket: string; code: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = mode === "login"
      ? { email: f.email, password: f.password, remember }
      : {
          email: f.email, password: f.password, accountType, locale, ...(accountType === "individual" && f.referralCode.trim() ? { referralCode: f.referralCode.trim() } : {}),
          individual: { fullName: f.fullName, phone: f.phone, nationality: f.nationality },
          company: { companyName: f.companyName, commercialRegNo: f.commercialRegNo, tourismLicenseNo: f.tourismLicenseNo, vatNo: f.vatNo, contactPerson: f.contactPerson, phone: f.phone, city: f.city },
        };
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) {
        setMinutes(data.minutes ?? 0);
        throw new Error(data.error);
      }
      if (data.mfa) {
        setMfa({ ticket: data.ticket, code: "" });
        setBusy(false);
        return;
      }
      setUser(data.user);
      onSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    if (!mfa) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/mfa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mfa) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMinutes(data.minutes ?? 0);
      setError(data.error ?? "generic");
      setBusy(false);
      if (data.error === "expired") setMfa(null);
      return;
    }
    setUser(data.user);
    onSuccess(data.user);
  }

  const errText = error ? fmt((a.errors as Record<string, string>)[error] ?? a.errors.generic, { minutes }) : null;

  if (mfa) {
    return (
      <form onSubmit={submitMfa} className="space-y-4" noValidate data-testid="mfa-form">
        <div>
          <h2 className="font-bold text-ink">{a.mfaTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{a.mfaIntro}</p>
        </div>
        <Field label={a.mfaCode} required>
          <Input value={mfa.code} onChange={(e) => setMfa({ ...mfa, code: e.target.value })} dir="ltr" inputMode="text" autoComplete="one-time-code" autoFocus maxLength={12} data-testid="mfa-code" />
        </Field>
        {errText && <Alert tone="error">{errText}</Alert>}
        <Button type="submit" className="w-full" loading={busy} disabled={mfa.code.trim().length < 6}>{a.verify}</Button>
        <button type="button" onClick={() => { setMfa(null); setError(null); }} className="w-full text-sm font-semibold text-brand-700 hover:underline">{a.backToLogin}</button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cx("h-9 rounded-md", mode === m ? "bg-white text-brand-800 shadow-sm" : "text-slate-600")}>
            {m === "login" ? a.loginTitle : a.registerTitle}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{a.accountType}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([["individual", UserIcon, a.individual, a.individualDesc], ["company", BuildingIcon, a.company, a.companyDesc]] as const).map(([v, Icon, label, desc]) => (
              <label key={v} className={cx("flex cursor-pointer gap-3 rounded-xl border p-3", accountType === v ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-slate-200")}>
                <input type="radio" name="accountType" className="sr-only" checked={accountType === v} onChange={() => setAccountType(v)} />
                <Icon className="size-6 shrink-0 text-brand-700" />
                <span>
                  <span className="block text-sm font-bold">{label}</span>
                  <span className="block text-xs text-slate-500">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className={cx("grid gap-4", !compact && mode === "register" && "sm:grid-cols-2")}>
        <Field label={a.email} required><Input type="email" dir="ltr" autoComplete="email" value={f.email} onChange={set("email")} /></Field>
        <Field label={a.password} required hint={mode === "register" ? a.passwordHint : undefined}>
          <PasswordInput autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set("password")} />
          {mode === "register" && <PasswordStrength value={f.password} />}
        </Field>
        {mode === "register" && accountType === "individual" && (
          <>
            <Field label={a.fullName} required><Input value={f.fullName} onChange={set("fullName")} /></Field>
            <Field label={a.phone} required hint={phoneHint(f.phone, f.nationality || "SA", t.travellers.fields.mobileLength)}>
              <PhoneInput value={f.phone} defaultCountry={f.nationality || "SA"} onChange={(v) => setF({ ...f, phone: v })} />
            </Field>
            <Field label={a.nationality}><CountrySelect value={f.nationality} onChange={(v) => setF({ ...f, nationality: v })} /></Field>
            <Field label={a.referralCode} hint={a.referralHint}><Input dir="ltr" value={f.referralCode} onChange={set("referralCode")} maxLength={12} /></Field>
          </>
        )}
        {mode === "register" && accountType === "company" && (
          <>
            <Field label={a.companyName} required><Input value={f.companyName} onChange={set("companyName")} /></Field>
            <Field label={a.commercialRegNo} required><Input dir="ltr" value={f.commercialRegNo} onChange={set("commercialRegNo")} /></Field>
            <Field label={a.tourismLicenseNo} required><Input dir="ltr" value={f.tourismLicenseNo} onChange={set("tourismLicenseNo")} /></Field>
            <Field label={a.vatNo}><Input dir="ltr" value={f.vatNo} onChange={set("vatNo")} /></Field>
            <Field label={a.contactPerson} required><Input value={f.contactPerson} onChange={set("contactPerson")} /></Field>
            <Field label={a.phone} required hint={phoneHint(f.phone, "SA", t.travellers.fields.mobileLength)}>
              <PhoneInput value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
            </Field>
            <Field label={a.city}><Input value={f.city} onChange={set("city")} /></Field>
          </>
        )}
      </div>
      {mode === "login" && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2 text-slate-700">
            <input type="checkbox" className="accent-brand-700" checked={remember} onChange={(e) => setRemember(e.target.checked)} />{a.remember}
          </label>
          <Link href={`/${locale}/forgot-password`} className="font-semibold text-brand-700 hover:underline" data-testid="forgot-link">{a.forgot}</Link>
        </div>
      )}
      {errText && <Alert tone="error">{errText}</Alert>}
      <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? a.submitLogin : a.submitRegister}</Button>
    </form>
  );
}
