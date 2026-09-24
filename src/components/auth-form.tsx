"use client";

import { useState } from "react";
import type { PublicUser } from "@/lib/auth/types";
import { useApp } from "./app-provider";
import { CountrySelect } from "./booking/country-select";
import { BuildingIcon, UserIcon } from "./icons";
import { Alert, Button, cx, Field, Input } from "./ui";

export function AuthForm({ initialMode = "login", onSuccess, compact }: {
  initialMode?: "login" | "register"; onSuccess: (u: PublicUser) => void; compact?: boolean;
}) {
  const { t, locale, setUser } = useApp();
  const a = t.auth;
  const [mode, setMode] = useState(initialMode);
  const [accountType, setAccountType] = useState<"individual" | "company">("individual");
  const [f, setF] = useState({
    email: "", password: "", fullName: "", phone: "", nationality: "",
    companyName: "", commercialRegNo: "", tourismLicenseNo: "", vatNo: "", contactPerson: "", city: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = mode === "login"
      ? { email: f.email, password: f.password }
      : {
          email: f.email, password: f.password, accountType, locale,
          individual: { fullName: f.fullName, phone: f.phone, nationality: f.nationality },
          company: { companyName: f.companyName, commercialRegNo: f.commercialRegNo, tourismLicenseNo: f.tourismLicenseNo, vatNo: f.vatNo, contactPerson: f.contactPerson, phone: f.phone, city: f.city },
        };
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUser(data.user);
      onSuccess(data.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const errText = error ? (a.errors as Record<string, string>)[error] ?? t.review.errors.generic : null;

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
          <Input type="password" dir="ltr" autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set("password")} />
        </Field>
        {mode === "register" && accountType === "individual" && (
          <>
            <Field label={a.fullName} required><Input value={f.fullName} onChange={set("fullName")} /></Field>
            <Field label={a.phone} required><Input type="tel" dir="ltr" value={f.phone} onChange={set("phone")} /></Field>
            <Field label={a.nationality}><CountrySelect value={f.nationality} onChange={(v) => setF({ ...f, nationality: v })} /></Field>
          </>
        )}
        {mode === "register" && accountType === "company" && (
          <>
            <Field label={a.companyName} required><Input value={f.companyName} onChange={set("companyName")} /></Field>
            <Field label={a.commercialRegNo} required><Input dir="ltr" value={f.commercialRegNo} onChange={set("commercialRegNo")} /></Field>
            <Field label={a.tourismLicenseNo} required><Input dir="ltr" value={f.tourismLicenseNo} onChange={set("tourismLicenseNo")} /></Field>
            <Field label={a.vatNo}><Input dir="ltr" value={f.vatNo} onChange={set("vatNo")} /></Field>
            <Field label={a.contactPerson} required><Input value={f.contactPerson} onChange={set("contactPerson")} /></Field>
            <Field label={a.phone} required><Input type="tel" dir="ltr" value={f.phone} onChange={set("phone")} /></Field>
            <Field label={a.city}><Input value={f.city} onChange={set("city")} /></Field>
          </>
        )}
      </div>
      {errText && <Alert tone="error">{errText}</Alert>}
      <Button type="submit" className="w-full" loading={busy}>{mode === "login" ? a.submitLogin : a.submitRegister}</Button>
    </form>
  );
}
