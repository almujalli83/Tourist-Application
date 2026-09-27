"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { AppleMark, GoogleMark } from "./auth-methods";
import { Alert, Button, Card, Field, Input } from "./ui";

/** Stands in for the Google / Apple sign-in page until the service is connected. */
export function SandboxSignIn({ provider, state }: { provider: "google" | "apple"; state: string }) {
  const { t } = useApp();
  const a = t.auth;
  const [f, setF] = useState({ name: "", email: "" });
  const name = provider === "google" ? "Google" : "Apple";
  function go(e: React.FormEvent) {
    e.preventDefault();
    const code = `sandbox:${btoa(unescape(encodeURIComponent(JSON.stringify({ name: f.name, email: f.email })))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
    location.href = `/api/auth/oauth/${provider}/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`;
  }
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card className="space-y-4 p-6">
        <h1 className="flex items-center gap-2 text-lg font-bold">{provider === "google" ? <GoogleMark /> : <AppleMark />}{a.sandboxTitle}</h1>
        <Alert tone="warning">{fmt(a.sandboxIntro, { provider: name })}</Alert>
        <form onSubmit={go} className="space-y-3" data-testid="sandbox-signin">
          <Field label={a.fullName}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="sbx-name" /></Field>
          <Field label={a.email}><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="sbx-email" /></Field>
          <Button type="submit" className="w-full" disabled={!f.email.includes("@")} data-testid="sbx-continue">{a.continue}</Button>
        </form>
      </Card>
    </div>
  );
}
