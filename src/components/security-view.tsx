"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { CheckIcon, LockIcon, PhoneIcon, ShieldIcon, TrashIcon, UserIcon } from "./icons";
import { PasswordInput, PasswordStrength } from "./password-input";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "./ui";

type Msg = { tone: "success" | "error" | "info"; text: string } | null;

async function post(url: string, data?: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}

function Section({ icon, title, badge, children, testId }: { icon: ReactNode; title: string; badge?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <Card className="space-y-4 p-5 sm:p-6" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-ink"><span className="text-brand-700">{icon}</span>{title}</h2>
        {badge}
      </div>
      {children}
    </Card>
  );
}

/** Account security: email, password, phone, two-step verification, devices, data. */
export function SecurityView() {
  const { t, locale, user, setUser } = useApp();
  const s = t.security;
  const err = useCallback((code?: string, minutes = 0) => fmt((t.auth.errors as Record<string, string>)[code ?? ""] ?? t.auth.errors.generic, { minutes }), [t]);
  const refresh = useCallback(async () => {
    const r = await fetch("/api/profile", { cache: "no-store" });
    if (r.ok) setUser((await r.json()).user);
  }, [setUser]);
  if (!user) return null;
  const day = (iso: string) => fmtDay(iso.slice(0, 10), locale, { day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <BackLink href={`/${locale}/account`} label={t.nav.myBookings} className="-ms-2.5" />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><ShieldIcon className="size-7 text-brand-700" />{s.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{s.intro}</p>
      </div>
      <EmailSection err={err} refresh={refresh} />
      <PasswordSection err={err} day={day} />
      <PhoneSection err={err} refresh={refresh} />
      <MfaSection err={err} day={day} refresh={refresh} />
      <DevicesSection day={day} />
      <DataSection err={err} />
    </div>
  );
}

type ErrFn = (code?: string, minutes?: number) => string;

function EmailSection({ err, refresh }: { err: ErrFn; refresh: () => Promise<void> }) {
  const { t, locale, user } = useApp();
  const s = t.security;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!user) return null;
  const verified = !!user.emailVerifiedAt;
  async function resend() {
    setBusy(true);
    const { ok, d } = await post("/api/auth/email/send", { locale });
    setBusy(false);
    setMsg(ok ? { tone: "success", text: s.resent } : { tone: "error", text: err(d.error, d.minutes) });
    if (d.error === "alreadyVerified") await refresh();
  }
  async function change(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/email", { ...f, locale });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setMsg({ tone: "success", text: s.email.sent });
    setOpen(false);
    setF({ email: "", password: "" });
  }
  return (
    <Section icon={<UserIcon className="size-5" />} title={s.email.title} testId="sec-email"
      badge={<Badge tone={verified ? "brand" : "amber"}>{verified ? <><CheckIcon className="size-3.5" />{s.verified}</> : s.notVerified}</Badge>}>
      <p className="text-sm font-semibold text-ink" dir="ltr">{user.email}</p>
      {!verified && <Button size="sm" variant="secondary" onClick={() => void resend()} loading={busy} data-testid="sec-resend">{s.resend}</Button>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {open ? (
        <form onSubmit={change} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Field label={s.email.newEmail}><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="sec-new-email" /></Field>
          {user.hasPassword !== false && <Field label={s.email.password}><PasswordInput autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="sec-email-password" /></Field>}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" loading={busy} data-testid="sec-email-submit">{s.email.submit}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>{s.mfa.cancel}</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="text-sm font-semibold text-brand-700 hover:underline" data-testid="sec-change-email">{s.email.change}</button>
      )}
    </Section>
  );
}

function PasswordSection({ err, day }: { err: ErrFn; day: (iso: string) => string }) {
  const { t, user } = useApp();
  const s = t.security.password;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!user) return null;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.next !== f.confirm) return setMsg({ tone: "error", text: t.auth.mismatch });
    setBusy(true);
    const { ok, d } = await post("/api/account/password", { current: f.current, next: f.next });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setMsg({ tone: "success", text: s.done });
    setOpen(false);
    setF({ current: "", next: "", confirm: "" });
  }
  return (
    <Section icon={<LockIcon className="size-5" />} title={s.title} testId="sec-password">
      {user.passwordChangedAt && <p className="text-sm text-slate-600">{fmt(s.lastChanged, { date: day(user.passwordChangedAt) })}</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {open ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
          {user.hasPassword !== false && <Field label={s.current}><PasswordInput autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} data-testid="sec-pw-current" /></Field>}
          <Field label={s.next}><PasswordInput autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} data-testid="sec-pw-next" /><PasswordStrength value={f.next} /></Field>
          <Field label={s.confirm}><PasswordInput autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} data-testid="sec-pw-confirm" /></Field>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" size="sm" loading={busy} data-testid="sec-pw-submit">{s.submit}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>{t.security.mfa.cancel}</Button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => { setOpen(true); setMsg(null); }} className="text-sm font-semibold text-brand-700 hover:underline" data-testid="sec-change-password">{s.change}</button>
      )}
    </Section>
  );
}

function PhoneSection({ err, refresh }: { err: ErrFn; refresh: () => Promise<void> }) {
  const { t, user } = useApp();
  const s = t.security.phone;
  const [sent, setSent] = useState<{ phone: string; sandbox: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!user) return null;
  const phone = user.individual?.phone || user.company?.phone || "";
  const verified = !!user.phoneVerifiedAt && user.verifiedPhone === phone;
  async function send() {
    setBusy(true);
    setMsg(null);
    const { ok, d } = await post("/api/account/phone/send");
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setSent(d);
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/phone/confirm", { code });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setSent(null);
    setCode("");
    setMsg({ tone: "success", text: s.done });
    await refresh();
  }
  return (
    <Section icon={<PhoneIcon className="size-5" />} title={s.title} testId="sec-phone"
      badge={phone ? <Badge tone={verified ? "brand" : "amber"}>{verified ? <><CheckIcon className="size-3.5" />{t.security.verified}</> : t.security.notVerified}</Badge> : undefined}>
      {phone ? <p className="text-sm font-semibold text-ink" dir="ltr">{phone}</p> : <p className="text-sm text-slate-600">{s.none}</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {phone && !verified && !sent && <Button size="sm" variant="secondary" onClick={() => void send()} loading={busy} data-testid="sec-phone-send">{s.send}</Button>}
      {sent && (
        <form onSubmit={confirm} className="flex flex-wrap items-end gap-2" noValidate>
          <Field label={fmt(s.code, { phone: sent.phone })}>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} dir="ltr" inputMode="numeric" autoComplete="one-time-code" className="w-40" data-testid="sec-phone-code" />
          </Field>
          <Button type="submit" size="sm" loading={busy} disabled={code.length !== 6} data-testid="sec-phone-confirm">{s.confirm}</Button>
          {sent.sandbox && <p className="w-full text-xs text-amber-700">{s.sandbox}</p>}
        </form>
      )}
    </Section>
  );
}

function MfaSection({ err, day, refresh }: { err: ErrFn; day: (iso: string) => string; refresh: () => Promise<void> }) {
  const { t, user } = useApp();
  const s = t.security.mfa;
  const [info, setInfo] = useState<{ enabled: boolean; enabledAt: string | null; recoveryLeft: number } | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [f, setF] = useState({ code: "", password: "" });
  const [codes, setCodes] = useState<string[] | null>(null);
  const [off, setOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => fetch("/api/account/mfa", { cache: "no-store" }).then((r) => r.json()).then(setInfo), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!user || !info) return <Card className="grid h-24 place-items-center text-brand-700"><Spinner className="size-5" /></Card>;
  const hasPw = user.hasPassword !== false;

  async function begin() {
    setBusy(true);
    setMsg(null);
    const { ok, d } = await post("/api/account/mfa/setup");
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error) });
    setSetup(d);
  }
  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/mfa/enable", { secret: setup!.secret, code: f.code, password: f.password });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setSetup(null);
    setF({ code: "", password: "" });
    setCodes(d.codes);
    setMsg(null);
    await Promise.all([load(), refresh()]);
  }
  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/mfa/disable", { code: f.code, password: f.password });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setOff(false);
    setF({ code: "", password: "" });
    setMsg(null);
    await Promise.all([load(), refresh()]);
  }
  async function regenerate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/mfa/recovery", { code: f.code });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setCodes(d.codes);
    setF({ code: "", password: "" });
    await load();
  }

  return (
    <Section icon={<ShieldIcon className="size-5" />} title={s.title} testId="sec-mfa"
      badge={<Badge tone={info.enabled ? "brand" : "slate"}>{info.enabled ? s.onBadge : s.offBadge}</Badge>}>
      {codes ? (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="sec-recovery">
          <p className="font-semibold text-ink">{s.recoveryTitle}</p>
          <p className="text-sm text-slate-700">{s.recoveryIntro}</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-5" dir="ltr">{codes.map((c) => <li key={c} className="rounded bg-white px-2 py-1 text-center ring-1 ring-amber-200">{c}</li>)}</ul>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); setCopied(true); }}>{copied ? s.copied : s.copy}</Button>
            <Button size="sm" onClick={() => { setCodes(null); setCopied(false); }} data-testid="sec-recovery-done">{s.done}</Button>
          </div>
        </div>
      ) : info.enabled ? (
        <>
          <p className="text-sm text-slate-600">{fmt(s.on, { date: info.enabledAt ? day(info.enabledAt) : "", n: info.recoveryLeft })}</p>
          {off ? (
            <form onSubmit={disable} className="grid gap-3 sm:grid-cols-2" noValidate>
              <p className="text-sm font-semibold sm:col-span-2">{s.disableTitle}</p>
              {hasPw && <Field label={s.password}><PasswordInput autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>}
              <Field label={s.codeOrRecovery}><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} autoComplete="one-time-code" data-testid="sec-mfa-off-code" /></Field>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" size="sm" variant="secondary" className="text-red-700" loading={busy} data-testid="sec-mfa-off-submit">{s.disable}</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setOff(false)}>{s.cancel}</Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form onSubmit={regenerate} className="flex flex-wrap items-end gap-2">
                <Field label={s.code}><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" className="w-32" /></Field>
                <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={f.code.length !== 6}>{s.regenerate}</Button>
              </form>
              <Button size="sm" variant="secondary" className="self-end text-red-700" onClick={() => { setOff(true); setF({ code: "", password: "" }); }} data-testid="sec-mfa-off">{s.disable}</Button>
            </div>
          )}
        </>
      ) : setup ? (
        <form onSubmit={enable} className="space-y-3" noValidate>
          <p className="text-sm text-slate-700">{s.step1}</p>
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="" width={180} height={180} className="rounded-lg ring-1 ring-slate-200" />
            <code className="break-all rounded bg-slate-100 px-2 py-1 text-xs" dir="ltr" data-testid="sec-mfa-secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </div>
          <p className="text-sm text-slate-700">{s.step2}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={s.code}><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" autoComplete="one-time-code" data-testid="sec-mfa-code" /></Field>
            {hasPw && <Field label={s.password}><PasswordInput autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="sec-mfa-password" /></Field>}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy} disabled={f.code.length !== 6} data-testid="sec-mfa-enable">{s.enable}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setSetup(null)}>{s.cancel}</Button>
          </div>
        </form>
      ) : (
        <>
          <p className="text-sm text-slate-600">{s.off}</p>
          <Button size="sm" onClick={() => void begin()} loading={busy} data-testid="sec-mfa-setup">{s.setup}</Button>
        </>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </Section>
  );
}

interface DeviceRow { id: string; device: string; method: string; createdAt: string; lastSeenAt: string; current: boolean }

function DevicesSection({ day }: { day: (iso: string) => string }) {
  const { t, locale } = useApp();
  const s = t.security.devices;
  const [rows, setRows] = useState<DeviceRow[] | null>(null);
  const load = useCallback(() => fetch("/api/account/sessions", { cache: "no-store" }).then((r) => r.json()).then((d) => setRows(d.sessions)), []);
  useEffect(() => {
    void load();
  }, [load]);
  const when = (iso: string) => `${day(iso)} ${new Date(iso).toLocaleTimeString(locale === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <Section icon={<ShieldIcon className="size-5" />} title={s.title} testId="sec-devices">
      <p className="text-sm text-slate-600">{s.intro}</p>
      {!rows ? <Spinner className="size-5 text-brand-700" /> : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3" data-testid="sec-device">
              <div>
                <p className="text-sm font-semibold text-ink">{r.device} {r.current && <Badge tone="brand" className="ms-1">{s.current}</Badge>}</p>
                <p className="text-xs text-slate-500">{fmt(s.lastSeen, { date: when(r.lastSeenAt) })} · {(s.methods as Record<string, string>)[r.method] ?? r.method}</p>
              </div>
              {!r.current && (
                <button type="button" onClick={async () => { await fetch(`/api/account/sessions/${encodeURIComponent(r.id)}`, { method: "DELETE" }); void load(); }} className="text-xs font-semibold text-red-700 hover:underline">
                  {s.signOut}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 1 && (
        <Button size="sm" variant="secondary" onClick={async () => { await fetch("/api/account/sessions", { method: "DELETE" }); void load(); }} data-testid="sec-signout-others">{s.signOutOthers}</Button>
      )}
    </Section>
  );
}

function DataSection({ err }: { err: ErrFn }) {
  const { t, locale, user, setUser } = useApp();
  const s = t.security.data;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ word: "", password: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!user) return null;
  async function del(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { ok, d } = await post("/api/account/delete", { password: f.password, code: f.code });
    setBusy(false);
    if (!ok) return setMsg({ tone: "error", text: err(d.error, d.minutes) });
    setUser(null);
    router.push(`/${locale}?deleted=1`);
    router.refresh();
  }
  return (
    <Section icon={<TrashIcon className="size-5" />} title={s.title} testId="sec-data">
      <p className="text-sm text-slate-600">{s.intro}</p>
      <div className="flex flex-wrap gap-2">
        <a href="/api/account/export" download className="inline-flex h-9 items-center rounded-lg bg-white px-3 text-sm font-semibold text-brand-800 ring-1 ring-brand-700/25 hover:bg-brand-50" data-testid="sec-export">{s.export}</a>
        {!open && <Button size="sm" variant="secondary" className="text-red-700" onClick={() => setOpen(true)} data-testid="sec-delete">{s.delete}</Button>}
      </div>
      {open && (
        <form onSubmit={del} className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4" noValidate>
          <p className="font-semibold text-red-800">{s.deleteTitle}</p>
          <p className="text-sm text-slate-700">{s.deleteIntro}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={s.confirmWord}><Input value={f.word} onChange={(e) => setF({ ...f, word: e.target.value })} data-testid="sec-delete-word" /></Field>
            {user.hasPassword !== false && <Field label={s.password}><PasswordInput autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} data-testid="sec-delete-password" /></Field>}
            {user.mfaEnabled && <Field label={s.code}><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>}
          </div>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="bg-red-700 hover:bg-red-800" loading={busy} disabled={f.word.trim() !== s.word} data-testid="sec-delete-confirm">{s.confirm}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>{t.security.mfa.cancel}</Button>
          </div>
        </form>
      )}
    </Section>
  );
}
