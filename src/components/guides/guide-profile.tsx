"use client";

import Link from "next/link";
import { useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { PublicGuide } from "@/lib/guides/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { ReviewsSection, RatingBadge, useSummaries } from "../reviews/shared";
import { ShieldIcon } from "../icons";
import { PhoneInput } from "../phone-input";
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from "../ui";
import { ContactButtons, GuideAvatar, LanguageChips, langLabel } from "./guide-card";

const ksaToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

function RequestForm({ g }: { g: PublicGuide }) {
  const { t, locale, user } = useApp();
  const f = t.guides.form;
  const [v, setV] = useState({
    city: g.cities[0] ?? "", date: "", startTime: "09:00", hours: 3, people: 2,
    language: g.languages.find((l) => l.code === locale)?.code ?? g.languages[0]?.code ?? "", notes: "", phone: user?.individual?.phone ?? user?.company?.phone ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; reference: string } | null>(null);

  if (!user) {
    return (
      <p className="text-sm">
        <Link href={`/${locale}/login?next=/${locale}/guides/${encodeURIComponent(g.licenseNo)}`} className="font-semibold text-brand-700 underline">{f.signIn}</Link>
      </p>
    );
  }
  if (done) {
    return (
      <Alert tone="success">
        <span data-testid="guide-request-sent">{fmt(f.sent, { ref: done.reference })}</span>{" "}
        <Link href={`/${locale}/account/guide-bookings/${done.id}`} className="font-semibold underline">{f.open}</Link>
      </Alert>
    );
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/guides/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...v, licenseNo: g.licenseNo }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setErr((t.guides.errors as Record<string, string>)[d.error] ?? t.guides.errors.generic);
      setDone(d.booking);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="space-y-4" data-testid="guide-request-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={f.city}>
          <Select value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })}>{g.cities.map((c) => <option key={c} value={c}>{cityName(c, locale)}</option>)}</Select>
        </Field>
        <Field label={f.language}>
          <Select value={v.language} onChange={(e) => setV({ ...v, language: e.target.value })} data-testid="guide-req-language">
            {g.languages.map((l) => <option key={l.code} value={l.code}>{langLabel(l.code, locale)} ({t.guides.levels[l.level]})</option>)}
          </Select>
        </Field>
        <Field label={f.date} required>
          <Input type="date" value={v.date} min={ksaToday()} max={g.licenseExpiry} onChange={(e) => setV({ ...v, date: e.target.value })} required data-testid="guide-req-date" />
        </Field>
        <Field label={f.time} required>
          <Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} required />
        </Field>
        <Field label={f.hours}>
          <Input type="number" min={1} max={10} value={v.hours} onChange={(e) => setV({ ...v, hours: Number(e.target.value) })} />
        </Field>
        <Field label={f.people}>
          <Input type="number" min={1} max={30} value={v.people} onChange={(e) => setV({ ...v, people: Number(e.target.value) })} />
        </Field>
        <Field label={f.phone}>
          <PhoneInput value={v.phone} onChange={(phone) => setV({ ...v, phone })} defaultCountry={user?.individual?.nationality || "SA"} />
        </Field>
      </div>
      <Field label={f.notes}>
        <Textarea rows={3} value={v.notes} maxLength={500} onChange={(e) => setV({ ...v, notes: e.target.value })} dir="auto" />
      </Field>
      <p className="text-xs text-slate-500">{f.hint}</p>
      {err && <Alert tone="error">{err}</Alert>}
      <Button type="submit" loading={busy} data-testid="guide-req-send">{f.send}</Button>
    </form>
  );
}

export function GuideProfile({ g, qrSvg }: { g: PublicGuide; qrSvg: string }) {
  const { t, locale } = useApp();
  const s = t.guides;
  const ar = locale === "ar";
  const summary = useSummaries("guide", [g.licenseNo])[g.licenseNo];
  const bio = ar ? g.bioAr : g.bioEn;
  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="guide-profile">
      <BackLink href={`/${locale}/guides`} label={s.nav} className="-ms-2.5" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <GuideAvatar g={g} className="size-20 text-2xl" />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">{ar ? g.nameAr : g.nameEn}</h1>
              <p className="text-sm text-slate-500" dir="ltr">{ar ? g.nameEn : g.nameAr}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700" data-testid="guide-license-status"><ShieldIcon className="size-3.5" />{s.licenseValid}</span>
                <span className="text-slate-500">{s.license}: <span className="ltr-nums font-semibold" dir="ltr">{g.licenseNo}</span></span>
                <span className="text-slate-500">{fmt(s.licenseUntil, { date: fmtDay(g.licenseExpiry, locale, { day: "numeric", month: "long", year: "numeric" }) })}</span>
                {g.demo && <Badge tone="gold">{s.sample}</Badge>}
              </p>
              <RatingBadge summary={summary} className="mt-1" />
            </div>
          </div>
          <ContactButtons phone={g.phone} />
          {bio && <div><h2 className="mb-1 text-sm font-bold text-slate-600">{s.about}</h2><p className="text-sm leading-6">{bio}</p></div>}
          <div><h2 className="mb-1.5 text-sm font-bold text-slate-600">{s.languages}</h2><LanguageChips languages={g.languages} /></div>
          <div><h2 className="mb-1.5 text-sm font-bold text-slate-600">{s.cities}</h2><p className="text-sm">{g.cities.map((c) => cityName(c, locale)).join(ar ? "، " : ", ")}</p></div>
          <div>
            <h2 className="mb-1.5 text-sm font-bold text-slate-600">{s.tracks}</h2>
            <span className="flex flex-wrap gap-1.5">{g.tracks.map((x) => <Badge key={x} tone="brand">{s.trackNames[x]}</Badge>)}</span>
          </div>
        </Card>
        <Card className="grid place-items-center p-5 text-center">
          <div className="w-full max-w-[200px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-2 text-xs text-slate-500">{s.verifyQr}</p>
        </Card>
      </div>
      <Card className="p-6" id="request">
        <h2 className="mb-4 text-lg font-bold">{s.form.title}</h2>
        <RequestForm g={g} />
      </Card>
      <ReviewsSection type="guide" id={g.licenseNo} />
    </div>
  );
}
