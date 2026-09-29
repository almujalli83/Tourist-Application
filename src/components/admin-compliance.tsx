"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { ShieldIcon } from "./icons";
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Textarea } from "./ui";

interface Status {
  privacyVersion: string;
  flows: {
    mode: "ksa" | "open"; region: string | null; hosting: string | null;
    database: { host: string | null; file?: boolean }; encryptionKey: boolean;
    services: { key: "ai" | "translate" | "blob" | "email"; configured: boolean; active: boolean; abroad: boolean; host?: string }[];
  };
  retention: { rules: { key: string; days: number }[]; lastRun: { at: string; total: number } | null };
  audit: Verification;
  incidents: { open: number; overdue: number };
}
interface Verification { ok: boolean; count: number; firstSeq: number | null; lastSeq: number | null; altered: number[]; missing: number[]; headMismatch: boolean }
interface Entry { id: string; seq: number; at: string; action: string; role: string; actorEmail: string | null; actorId: string | null; status: number | null; ip: string | null; device: string | null }
interface Incident {
  id: string; title: string; description: string; severity: "low" | "medium" | "high" | "critical"; status: "open" | "contained" | "closed";
  personalData: boolean; affected: number | null; detectedAt: string; authorityNotifiedAt: string | null; usersNotifiedAt: string | null;
  notes: { at: string; by: string; text: string }[]; deadline: { due: string; hoursLeft: number } | null;
}

export function AdminCompliance() {
  const { t, locale } = useApp();
  const c = t.compliance;
  const when = useCallback((iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(iso)), [locale]);
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/compliance/status");
    if (r.ok) setStatus(await r.json());
  }, []);
  useEffect(() => void load(), [load]);

  async function runRetention() {
    const r = await fetch("/api/admin/compliance/retention", { method: "POST" });
    if (r.ok) setMsg(fmt(c.retention.ran, { n: (await r.json()).total }));
    void load();
  }

  if (!status) return <div className="grid place-items-center py-20"><Spinner /></div>;
  const f = status.flows;
  const rows = t.privacy.retention.rows as Record<string, string>;
  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/admin`} />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><ShieldIcon className="size-7 text-brand-700" />{c.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{c.intro}</p>
        <p className="mt-1 text-xs text-slate-500">{fmt(c.privacyVersion, { v: status.privacyVersion })}</p>
      </div>
      {msg && <Alert tone="success">{msg}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3 p-5" data-testid="cmp-residency">
          <h2 className="font-bold">{c.residency.title}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-600">{c.residency.mode}</dt>
            <dd><Badge tone={f.mode === "ksa" ? "brand" : "amber"}>{f.mode === "ksa" ? c.residency.ksa : c.residency.open}</Badge></dd>
            <dt className="text-slate-600">{c.residency.region}</dt><dd dir="ltr" className="text-start">{f.region ?? c.residency.unknown}</dd>
            <dt className="text-slate-600">{c.residency.hosting}</dt><dd dir="ltr" className="text-start">{f.hosting ?? c.residency.unknown}</dd>
            <dt className="text-slate-600">{c.residency.database}</dt><dd dir="ltr" className="text-start">{f.database.host ?? c.residency.dbFile}</dd>
            <dt className="text-slate-600">{c.residency.encryption}</dt><dd><Badge tone={f.encryptionKey ? "brand" : "amber"}>{f.encryptionKey ? c.residency.set : c.residency.notSet}</Badge></dd>
          </dl>
          <ul className="divide-y divide-slate-100 text-sm">
            {f.services.map((s) => (
              <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{c.residency.services[s.key]}</span>
                <span className="flex gap-1.5">
                  <Badge tone={s.active ? "brand" : "slate"}>{s.active ? c.residency.active : s.configured ? c.residency.off : c.residency.notConfigured}</Badge>
                  {s.active && <Badge tone={s.abroad ? "amber" : "slate"}>{s.abroad ? c.residency.abroad : c.residency.notAbroad}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-3 p-5" data-testid="cmp-retention">
          <h2 className="font-bold">{c.retention.title}</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {status.retention.rules.map((r) => <tr key={r.key}><td className="py-1.5 text-slate-700">{rows[r.key] ?? r.key}</td><td className="py-1.5 text-end font-medium">{fmt(c.retention.days, { n: r.days })}</td></tr>)}
            </tbody>
          </table>
          <p className="text-sm text-slate-600">{status.retention.lastRun ? fmt(c.retention.lastRun, { date: when(status.retention.lastRun.at), n: status.retention.lastRun.total }) : c.retention.never}</p>
          <Button size="sm" variant="secondary" onClick={runRetention} data-testid="cmp-run-retention">{c.retention.runNow}</Button>
        </Card>
      </div>

      <AuditPanel initial={status.audit} when={when} />
      <IncidentsPanel when={when} onChange={load} summary={status.incidents} />
    </div>
  );
}

function AuditPanel({ initial, when }: { initial: Verification; when: (iso: string) => string }) {
  const { t } = useApp();
  const c = t.compliance.audit;
  const [v, setV] = useState(initial);
  const [q, setQ] = useState({ actor: "", action: "" });
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const search = useCallback(async (actor = "", action = "") => {
    const r = await fetch(`/api/admin/compliance/audit?actor=${encodeURIComponent(actor)}&action=${encodeURIComponent(action)}&limit=200`);
    if (r.ok) setEntries((await r.json()).entries);
  }, []);
  useEffect(() => void search(), [search]);
  async function verify() {
    const r = await fetch("/api/admin/compliance/audit/verify");
    if (r.ok) setV(await r.json());
  }
  return (
    <Card className="space-y-4 p-5" data-testid="cmp-audit">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{c.title}</h2>
        <Button size="sm" variant="secondary" onClick={verify} data-testid="cmp-verify">{c.verify}</Button>
      </div>
      <Alert tone={v.ok ? "success" : "error"}>
        <span data-testid="cmp-verify-result">
          {v.ok
            ? v.count ? fmt(c.ok, { n: v.count, first: v.firstSeq ?? 0, last: v.lastSeq ?? 0 }) : c.okEmpty
            : <>{fmt(c.broken, { altered: v.altered.length, missing: v.missing.length })}{v.headMismatch ? ` ${c.headMismatch}` : ""}</>}
        </span>
      </Alert>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void search(q.actor, q.action); }}>
        <Field label={c.actor} className="min-w-48 flex-1"><Input value={q.actor} onChange={(e) => setQ({ ...q, actor: e.target.value })} /></Field>
        <Field label={c.action} className="min-w-48 flex-1"><Input dir="ltr" value={q.action} onChange={(e) => setQ({ ...q, action: e.target.value })} /></Field>
        <Button type="submit" size="sm">{c.search}</Button>
      </form>
      {!entries ? <Spinner /> : entries.length === 0 ? <p className="text-sm text-slate-600">{c.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-start text-slate-600">
              <tr>{(["at", "action", "actor", "role", "status", "ip", "device"] as const).map((k) => <th key={k} scope="col" className="px-2 py-2 text-start font-semibold">{c.cols[k]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-2 py-1.5">#{e.seq} · {when(e.at)}</td>
                  <td className="px-2 py-1.5 font-mono" dir="ltr">{e.action}</td>
                  <td className="px-2 py-1.5" dir="ltr">{e.actorEmail ?? e.actorId ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.role}</td>
                  <td className="px-2 py-1.5"><Badge tone={e.status && e.status >= 400 ? "red" : "slate"}>{e.status ?? "—"}</Badge></td>
                  <td className="px-2 py-1.5 font-mono" dir="ltr">{e.ip ?? "—"}</td>
                  <td className="px-2 py-1.5">{e.device ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function IncidentsPanel({ when, onChange, summary }: { when: (iso: string) => string; onChange: () => void; summary: { open: number; overdue: number } }) {
  const { t } = useApp();
  const c = t.compliance.incidents;
  const [list, setList] = useState<Incident[] | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", description: "", severity: "", personalData: true, affected: "", detectedAt: "" });
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/compliance/incidents");
    if (r.ok) setList((await r.json()).incidents);
  }, []);
  useEffect(() => void load(), [load]);
  const errText = (code: string) => (c.errors as Record<string, string>)[code] ?? c.errors.generic;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admin/compliance/incidents", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...f, affected: f.affected ? Number(f.affected) : undefined, detectedAt: f.detectedAt ? new Date(f.detectedAt).toISOString() : undefined }),
    });
    if (!r.ok) return setErr(errText((await r.json()).error));
    setErr(null);
    setOpen(false);
    setF({ title: "", description: "", severity: "", personalData: true, affected: "", detectedAt: "" });
    await load();
    onChange();
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/compliance/incidents/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return setErr(errText((await r.json()).error));
    await load();
    onChange();
  }

  return (
    <Card className="space-y-4 p-5" data-testid="cmp-incidents">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">{c.title}</h2>
          <p className="text-xs text-slate-500">{fmt(c.summary, summary)}</p>
        </div>
        {!open && <Button size="sm" onClick={() => setOpen(true)} data-testid="cmp-new-incident">{c.new}</Button>}
      </div>
      {err && <Alert tone="error">{err}</Alert>}
      {open && (
        <form onSubmit={create} className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2" noValidate>
          <Field label={c.fields.title} required className="sm:col-span-2"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="inc-title" /></Field>
          <Field label={c.fields.description} className="sm:col-span-2"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label={c.fields.severity} required>
            <Select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} data-testid="inc-severity">
              <option value="" />
              {(["low", "medium", "high", "critical"] as const).map((s) => <option key={s} value={s}>{c.severities[s]}</option>)}
            </Select>
          </Field>
          <Field label={c.fields.detectedAt}><Input type="datetime-local" dir="ltr" value={f.detectedAt} onChange={(e) => setF({ ...f, detectedAt: e.target.value })} /></Field>
          <Field label={c.fields.affected}><Input inputMode="numeric" dir="ltr" value={f.affected} onChange={(e) => setF({ ...f, affected: e.target.value.replace(/\D/g, "") })} /></Field>
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={f.personalData} onChange={(e) => setF({ ...f, personalData: e.target.checked })} className="size-4 accent-brand-700" />{c.fields.personalData}</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" data-testid="inc-create">{c.create}</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
          </div>
        </form>
      )}
      {!list ? <Spinner /> : list.length === 0 ? <p className="text-sm text-slate-600">{c.empty}</p> : (
        <ul className="space-y-3">
          {list.map((i) => <IncidentItem key={i.id} i={i} when={when} patch={patch} />)}
        </ul>
      )}
    </Card>
  );
}

function IncidentItem({ i, when, patch }: { i: Incident; when: (iso: string) => string; patch: (id: string, b: Record<string, unknown>) => Promise<void> }) {
  const { t } = useApp();
  const c = t.compliance.incidents;
  const [note, setNote] = useState("");
  const tone = { low: "slate", medium: "gold", high: "amber", critical: "red" } as const;
  return (
    <li className="space-y-2 rounded-xl border border-slate-200 p-4" data-testid="incident">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{i.title}</p>
        <Badge tone={tone[i.severity]}>{c.severities[i.severity]}</Badge>
        <Badge tone={i.status === "closed" ? "slate" : "brand"}>{c.statuses[i.status]}</Badge>
        <span className="text-xs text-slate-500">{when(i.detectedAt)}</span>
      </div>
      {i.description && <p className="whitespace-pre-line text-sm text-slate-700">{i.description}</p>}
      {i.deadline && (
        <Alert tone={i.deadline.hoursLeft < 0 ? "error" : "warning"}>
          <span data-testid="inc-deadline">{i.deadline.hoursLeft < 0 ? fmt(c.overdue, { date: when(i.deadline.due) }) : fmt(c.deadline, { date: when(i.deadline.due), h: i.deadline.hoursLeft })}</span>
        </Alert>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {i.authorityNotifiedAt && <span>{fmt(c.authorityNotified, { date: when(i.authorityNotifiedAt) })}</span>}
        {i.usersNotifiedAt && <span>{fmt(c.usersNotified, { date: when(i.usersNotifiedAt) })}</span>}
      </div>
      {i.notes.length > 0 && (
        <ul className="space-y-1 border-s-2 border-slate-200 ps-3 text-xs text-slate-700">
          {i.notes.map((n) => <li key={n.at}><span className="text-slate-500">{when(n.at)} · {n.by}:</span> {n.text}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label={c.status}>
          <Select value={i.status} onChange={(e) => void patch(i.id, { status: e.target.value })} className="h-9">
            {(["open", "contained", "closed"] as const).map((s) => <option key={s} value={s}>{c.statuses[s]}</option>)}
          </Select>
        </Field>
        {i.personalData && !i.authorityNotifiedAt && <Button size="sm" variant="secondary" onClick={() => void patch(i.id, { authorityNotified: true })} data-testid="inc-authority">{c.markAuthority}</Button>}
        {i.personalData && !i.usersNotifiedAt && <Button size="sm" variant="secondary" onClick={() => void patch(i.id, { usersNotified: true })}>{c.markUsers}</Button>}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void patch(i.id, { note }).then(() => setNote("")); }}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={c.note} aria-label={c.note} className="h-9" />
        <Button type="submit" size="sm" variant="secondary">{c.save}</Button>
      </form>
    </li>
  );
}
