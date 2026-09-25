"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { operationsOverview } from "@/lib/admin";
import { useApp } from "./app-provider";
import { RefreshIcon } from "./icons";
import { StatusBadge } from "./booking-details";
import { Alert, Badge, Button, Card, Spinner } from "./ui";

type Overview = Awaited<ReturnType<typeof operationsOverview>>;

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="font-bold">{title}</h2>
        {count !== undefined && <Badge tone={count ? "red" : "brand"}>{count}</Badge>}
      </div>
      {children}
    </Card>
  );
}

/** Back office: operations dashboard. */
export function AdminOperations() {
  const { t, locale, money } = useApp();
  const a = t.admin;
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const dt = (d: string) => new Date(d).toLocaleString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/operations", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, url: string, payload?: unknown) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });
      const body = await res.json().catch(() => ({}));
      setMsg(`${a.done}: ${body.status ?? body.error ?? res.status}`);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const empty = <p className="px-5 py-6 text-center text-sm text-slate-500">{a.none}</p>;
  const bookingLink = (b: { reference: string; id: string }) => <span className="ltr-nums font-bold text-brand-800">{b.reference}</span>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.subtitle}</p>
        </div>
        <Button variant="secondary" onClick={() => void load()}><RefreshIcon className="size-4" />{a.refresh}</Button>
      </div>

      {!data.emailProvider && <Alert tone="warning">{a.emailProviderOff}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(Object.keys(a.counts) as (keyof typeof a.counts)[]).map((k) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-slate-500">{a.counts[k]}</p>
            <p className={`mt-1 text-2xl font-bold ${["mtIssues", "submissionFailed", "emailFailures"].includes(k) && data.counts[k] ? "text-red-700" : "text-brand-800"}`}>{data.counts[k]}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={a.mtIssues} count={data.mtIssues.length}>
          {data.mtIssues.length === 0 ? empty : (
            <ul className="divide-y divide-slate-100">
              {data.mtIssues.map(({ booking: b, modification: m }) => (
                <li key={m.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {bookingLink(b)}
                    <Badge tone="red">{t.modify.log.mt[m.status]}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{m.kind === "extend" ? t.modify.log.extend : t.modify.log.shorten} · <span className="ltr-nums">{m.newReturnDate} · {dt(m.createdAt)}</span></p>
                  <p className="ltr-nums text-xs text-red-700">{fmt(a.failedApplicants, { list: m.failed.map((f) => `${f.applicationNo} (${f.errorCodes.join(",")})`).join("، ") })}</p>
                  <Button size="sm" loading={busy === m.id} onClick={() => void act(m.id, `/api/admin/bookings/${b.id}/retry-mt`, { modificationId: m.id })}>{a.retryMt}</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={a.submissionFailed} count={data.submissionFailed.length}>
          {data.submissionFailed.length === 0 ? empty : (
            <ul className="divide-y divide-slate-100">
              {data.submissionFailed.map(({ booking: b, errors }) => (
                <li key={b.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">{bookingLink(b)}<StatusBadge status={b.packageStatus ?? b.status} /></div>
                  <ul className="ltr-nums text-xs text-red-700">{errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}</ul>
                  <Button size="sm" variant="secondary" loading={busy === b.id} onClick={() => void act(b.id, `/api/admin/bookings/${b.id}/refresh`)}>{a.refreshStatus}</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={a.emailFailures} count={data.emailFailures.length}>
          {data.emailFailures.length === 0 ? empty : (
            <ul className="divide-y divide-slate-100">
              {data.emailFailures.map((e) => (
                <li key={e.id} className="space-y-1 px-5 py-4 text-sm">
                  <p className="font-semibold">{e.subject}</p>
                  <p className="ltr-nums text-xs text-slate-500">{e.to.join(", ")} · {dt(e.createdAt)} · ×{e.attempts}</p>
                  <p className="text-xs text-red-700">{e.error}</p>
                  <Button size="sm" variant="secondary" loading={busy === e.id} onClick={() => void act(e.id, `/api/admin/outbox/${e.id}/resend`)}>{a.resend}</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={a.stuckLocks} count={data.stuckLocks.length}>
          {data.stuckLocks.length === 0 ? empty : (
            <ul className="divide-y divide-slate-100">{data.stuckLocks.map((b) => <li key={b.id} className="px-5 py-3 text-sm">{bookingLink(b)}</li>)}</ul>
          )}
        </Section>
      </div>

      <Section title={a.recentChanges}>
        {data.recentChanges.length === 0 ? empty : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.recentChanges.map(({ booking: b, modification: m }) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3">{bookingLink(b)}</td>
                    <td className="px-3 py-3"><Badge tone={m.kind === "extend" ? "brand" : "gold"}>{m.kind === "extend" ? t.modify.log.extend : t.modify.log.shorten}</Badge></td>
                    <td className="ltr-nums px-3 py-3">{m.previousReturnDate} → {m.newReturnDate}</td>
                    <td className="ltr-nums px-3 py-3">{m.chargeSAR ? `+${money(m.chargeSAR)}` : m.refundSAR ? `−${money(m.refundSAR)}` : "—"}</td>
                    <td className="px-3 py-3"><Badge tone={m.mt.status === "UPDATED" ? "brand" : "red"}>{t.modify.log.mt[m.mt.status]}</Badge></td>
                    <td className="ltr-nums px-3 py-3 text-xs text-slate-500">{(m.agents ?? []).map((x) => `${locale === "ar" ? x.agentNameAr : x.agentNameEn}: ${x.reference}`).join(" · ")}</td>
                    <td className="ltr-nums px-5 py-3 text-xs text-slate-500">{dt(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={a.recentEmails}>
        {data.recentEmails.length === 0 ? empty : (
          <ul className="divide-y divide-slate-100">
            {data.recentEmails.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0"><span className="font-semibold">{e.subject}</span> <span className="ltr-nums text-xs text-slate-500">→ {e.to.join(", ")}</span></span>
                <span className="flex items-center gap-2">
                  <Badge tone={e.status === "sent" ? "brand" : e.status === "failed" ? "red" : "slate"}>{a.emailStatus[e.status]}</Badge>
                  <span className="ltr-nums text-xs text-slate-500">{dt(e.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
