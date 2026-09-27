"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import type { UmrahSeason } from "@/lib/umrah/season";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Button, Card, Field, Input } from "../ui";

/** Back office: the Umrah permit pause for the Hajj season (announced yearly). */
export function AdminUmrah() {
  const { t, locale } = useApp();
  const a = t.umrah.admin;
  const [season, setSeason] = useState<UmrahSeason | null>(null);
  const [v, setV] = useState({ pauseFrom: "", pauseTo: "" });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // The form opens once the saved dates are loaded (so a late load can't overwrite what was typed).
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch("/api/admin/umrah", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setSeason(d.season);
      setV({ pauseFrom: d.season?.pauseFrom ?? "", pauseTo: d.season?.pauseTo ?? "" });
      setLoaded(true);
    }).catch(() => undefined);
  }, []);
  async function save(next: typeof v) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/umrah", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: a.invalid });
    setSeason(d.season);
    setV({ pauseFrom: d.season.pauseFrom ?? "", pauseTo: d.season.pauseTo ?? "" });
    setMsg({ tone: "success", text: a.saved });
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5" data-testid="admin-umrah">
      <BackLink href={`/${locale}/admin`} label={t.admin.nav} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{a.intro}</p>
      </div>
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={a.from}><Input type="date" value={v.pauseFrom} disabled={!loaded} onChange={(e) => setV({ ...v, pauseFrom: e.target.value })} data-testid="pause-from" /></Field>
          <Field label={a.to}><Input type="date" value={v.pauseTo} disabled={!loaded} min={v.pauseFrom || undefined} onChange={(e) => setV({ ...v, pauseTo: e.target.value })} data-testid="pause-to" /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={!loaded} onClick={() => save(v)} data-testid="pause-save">{a.save}</Button>
          <Button variant="secondary" disabled={busy || !loaded} onClick={() => save({ pauseFrom: "", pauseTo: "" })}>{a.clear}</Button>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {season?.updatedAt && <p className="text-xs text-slate-500">{fmt(a.updated, { at: fmtKsa(season.updatedAt, locale, { dateStyle: "medium", timeStyle: "short" }), by: season.updatedBy ?? "" })}</p>}
      </Card>
    </div>
  );
}
