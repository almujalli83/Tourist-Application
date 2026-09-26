"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import type { loyaltyOverview, memberDetails } from "@/lib/loyalty/loyalty";
import { LOYALTY, type EarnService } from "@/lib/loyalty/rules";
import type { LoyaltyCampaign } from "@/lib/loyalty/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { GiftIcon, RefreshIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Spinner } from "../ui";

type Overview = Awaited<ReturnType<typeof loyaltyOverview>>;
type Member = NonNullable<Awaited<ReturnType<typeof memberDetails>>>;
const SERVICES = Object.keys(LOYALTY.pointsPerSAR) as EarnService[];
const n = (x: number) => x.toLocaleString("en");

function MemberPanel() {
  const { t, locale } = useApp();
  const l = t.loyalty;
  const a = l.admin;
  const [email, setEmail] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [adj, setAdj] = useState({ points: "", note: "" });
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const errText = (code: string) => (a.errors as Record<string, string>)[code] ?? t.review.errors.generic;

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/loyalty/members?email=${encodeURIComponent(email.trim())}`, { cache: "no-store" });
      const d = await res.json();
      if (!res.ok) {
        setMember(null);
        return setMsg({ tone: "error", text: errText(d.error) });
      }
      setMember(d);
    } finally {
      setBusy(false);
    }
  }

  async function adjust(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/loyalty/adjust", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: member.member.email, points: Number(adj.points), note: adj.note }) });
      const d = await res.json();
      if (!res.ok) return setMsg({ tone: "error", text: errText(d.error) });
      setMember(d);
      setAdj({ points: "", note: "" });
      setMsg({ tone: "success", text: a.adjust.done });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-bold">{a.member.title}</h2>
      <form onSubmit={search} className="mt-3 flex gap-2">
        <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={a.member.email} aria-label={a.member.email} required />
        <Button type="submit" variant="secondary" loading={busy && !member}>{a.member.search}</Button>
      </form>
      {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      {member && (
        <div className="mt-4 space-y-4" data-testid="admin-member">
          <div className="text-sm">
            <p className="font-semibold">{member.member.name} <span className="font-normal text-slate-500" dir="ltr">({member.member.email})</span></p>
            {member.summary.eligible ? (
              <p className="text-slate-600">
                {l.tiers[member.summary.tier.id as keyof typeof l.tiers]} · {a.available}: <b className="ltr-nums">{n(member.summary.available)}</b> · {a.pending}: <b className="ltr-nums">{n(member.summary.pending)}</b>
                {member.member.since && <> · {fmt(a.member.since, { date: fmtKsa(member.member.since, locale, { dateStyle: "medium" }) })}</>}
              </p>
            ) : <p className="text-slate-500">{a.member.company}</p>}
          </div>
          {member.summary.eligible && (
            <form onSubmit={adjust} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <Field label={a.adjust.points}><Input type="number" dir="ltr" step={1} value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} required /></Field>
              <Field label={a.adjust.note}><Input value={adj.note} maxLength={300} onChange={(e) => setAdj({ ...adj, note: e.target.value })} required /></Field>
              <Button type="submit" loading={busy}>{a.adjust.submit}</Button>
            </form>
          )}
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm">
            {member.entries.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-2">
                <span>
                  {l.types[e.type]}{e.source && e.source.kind !== "admin" ? ` · ${l.sources[e.source.kind]} ${e.source.reference ?? ""}` : ""}
                  <span className="block text-xs text-slate-500">{fmtKsa(e.at, locale, { dateStyle: "medium" })}{e.note ? ` · ${e.note}` : ""}{e.by ? ` · ${a.audit.by} ${e.by}` : ""}{e.demo ? ` · ${l.demo}` : ""}</span>
                </span>
                <span className={cx("ltr-nums font-semibold", e.points >= 0 ? "text-emerald-700" : "text-slate-700")}>{e.points >= 0 ? "+" : ""}{n(e.points)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Campaigns({ campaigns, onChanged }: { campaigns: LoyaltyCampaign[]; onChanged: () => void }) {
  const { t, locale } = useApp();
  const l = t.loyalty;
  const c = l.admin.campaigns;
  const empty = { nameAr: "", nameEn: "", from: "", to: "", multiplier: "2", cities: "", services: [] as EarnService[] };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setErr(null);
    setBusy(url + method);
    try {
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr((l.admin.errors as Record<string, string>)[d.error] ?? t.review.errors.generic);
        return false;
      }
      onChanged();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/admin/loyalty/campaigns", "POST", { ...f, multiplier: Number(f.multiplier), cities: f.cities.split(/[\s,،]+/).filter(Boolean) });
    if (ok) setF(empty);
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-bold">{c.title}</h2>
      {campaigns.length === 0 ? <p className="mt-2 text-sm text-slate-500">{c.empty}</p> : (
        <ul className="mt-3 divide-y divide-slate-100 text-sm" data-testid="admin-campaigns">
          {campaigns.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{locale === "ar" ? x.nameAr : x.nameEn}</b> · ×{x.multiplier} · <span dir="ltr">{x.from} → {x.to}</span>
                <span className="block text-xs text-slate-500">{x.services.length ? x.services.map((s) => l.sources[s]).join(", ") : l.campaigns.all}{x.cities.length ? ` · ${x.cities.join(", ")}` : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={x.active ? "brand" : "slate"}>{x.active ? c.active : c.paused}</Badge>
                <Button size="sm" variant="secondary" loading={busy === `/api/admin/loyalty/campaigns/${x.id}PATCH`} onClick={() => void call(`/api/admin/loyalty/campaigns/${x.id}`, "PATCH", { active: !x.active })}>{x.active ? c.pause : c.resume}</Button>
                <Button size="sm" variant="secondary" loading={busy === `/api/admin/loyalty/campaigns/${x.id}DELETE`} onClick={() => void call(`/api/admin/loyalty/campaigns/${x.id}`, "DELETE")}>{c.delete}</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
        <p className="font-semibold sm:col-span-2">{c.new}</p>
        <Field label={c.nameAr} required><Input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} required /></Field>
        <Field label={c.nameEn} required><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} required /></Field>
        <Field label={c.from} required><Input type="date" dir="ltr" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} required /></Field>
        <Field label={c.to} required><Input type="date" dir="ltr" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} required /></Field>
        <Field label={c.multiplier} required><Input type="number" dir="ltr" min={1.1} max={5} step={0.05} value={f.multiplier} onChange={(e) => setF({ ...f, multiplier: e.target.value })} required /></Field>
        <Field label={c.cities}><Input dir="ltr" value={f.cities} onChange={(e) => setF({ ...f, cities: e.target.value.toUpperCase() })} placeholder="RUH, ULH" /></Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-slate-700">{c.services}</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {SERVICES.map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input type="checkbox" className="size-4 accent-brand-700" checked={f.services.includes(s)} onChange={(e) => setF({ ...f, services: e.target.checked ? [...f.services, s] : f.services.filter((x) => x !== s) })} />
                {l.sources[s]}
              </label>
            ))}
          </div>
        </fieldset>
        {err && <Alert tone="error" className="sm:col-span-2">{err}</Alert>}
        <Button type="submit" className="sm:col-span-2 sm:justify-self-start" loading={busy === "/api/admin/loyalty/campaignsPOST"}>{c.create}</Button>
      </form>
    </Card>
  );
}

/** Back office — loyalty programme: outstanding points, member adjustments (audited) and points offers. */
export function AdminLoyalty() {
  const { t, locale, money } = useApp();
  const l = t.loyalty;
  const a = l.admin;
  const [data, setData] = useState<{ overview: Overview; campaigns: LoyaltyCampaign[] } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const res = await fetch("/api/admin/loyalty", { cache: "no-store" });
    if (!res.ok) return setError(true);
    setData(await res.json());
  }, []);
  useEffect(() => void load(), [load]);

  const o = data?.overview;
  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/admin`} label={t.admin.nav} className="-ms-2.5" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><GiftIcon className="size-6 text-gold-600" />{a.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{a.subtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}><RefreshIcon className="size-4" />{t.admin.refresh}</Button>
      </div>
      {error && <Alert tone="error">{t.review.errors.generic}</Alert>}
      {!o ? (
        !error && <div className="grid min-h-[30vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="admin-loyalty-stats">
            {[
              [a.members, n(o.members)],
              [a.available, n(o.available)],
              [a.pending, n(o.pending)],
              [a.liability, money(o.liabilitySAR)],
            ].map(([k, v]) => (
              <Card key={k} className="p-5">
                <p className="text-sm text-slate-500">{k}</p>
                <p className="ltr-nums mt-1 text-2xl font-bold text-brand-800">{v}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-slate-500">{a.liabilityHint}{o.deficit ? ` · ${a.deficit}: ${n(o.deficit)}` : ""}</p>
          <Alert tone="info">{a.vatNote}</Alert>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold">{a.last30}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                {([[a.earned, o.last30.earned], [a.redeemed, o.last30.redeemed], [a.expired, o.last30.expired], [a.reversed, o.last30.reversed]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-3"><dt className="text-slate-500">{k}</dt><dd className="ltr-nums text-lg font-bold">{n(v)}</dd></div>
                ))}
              </dl>
              <h3 className="mt-5 font-semibold">{a.tiers}</h3>
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {Object.entries(o.tiers).map(([k, v]) => <li key={k}><Badge tone="gold">{l.tiers[k as keyof typeof l.tiers]}: {v}</Badge></li>)}
              </ul>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="font-bold">{a.top}</h2>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {o.top.map((m) => (
                  <li key={m.email} className="flex justify-between gap-2 py-2">
                    <span dir="ltr" className="truncate">{m.email}</span>
                    <span className="ltr-nums shrink-0">{n(m.available)} <span className="text-xs text-slate-500">+{n(m.pending)}</span> · {l.tiers[m.tier as keyof typeof l.tiers]}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <MemberPanel />
          <Campaigns campaigns={data.campaigns} onChanged={() => void load()} />
          <Card className="p-5 sm:p-6">
            <h2 className="font-bold">{a.audit.title}</h2>
            {o.adjustments.length === 0 ? <p className="mt-2 text-sm text-slate-500">{a.audit.empty}</p> : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {o.adjustments.map((x, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span><span dir="ltr">{x.email}</span> · {x.note}<span className="block text-xs text-slate-500">{fmtKsa(x.at, locale, { dateStyle: "medium", timeStyle: "short" })} · {a.audit.by} {x.by}</span></span>
                    <span className={cx("ltr-nums font-semibold", x.points >= 0 ? "text-emerald-700" : "text-red-700")}>{x.points >= 0 ? "+" : ""}{n(x.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
