"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import { useApp } from "./app-provider";
import { ShareIcon } from "./icons";
import { Alert, Button, Card } from "./ui";

/** Read-only links to a trip for companions (in the booking details). */
export function TripShareCard({ bookingId }: { bookingId: string }) {
  const { t, locale } = useApp();
  const s = t.tripShare;
  const [links, setLinks] = useState<{ ref: string; expiresAt: string }[]>([]);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch(`/api/bookings/${bookingId}/share`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : { links: [] })).then((d) => setLinks(d.links)), [bookingId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/bookings/${bookingId}/share`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((s.errors as Record<string, string>)[d.error] ?? s.errors.generic);
    setUrl(d.url);
    setCopied(false);
    void load();
  }
  async function shareIt() {
    if (!url) return;
    if (navigator.share) await navigator.share({ title: s.pageTitle, url }).catch(() => undefined);
    else {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
    }
  }
  return (
    <Card className="space-y-3 p-5" data-testid="trip-share">
      <h2 className="flex items-center gap-2 font-bold text-ink"><ShareIcon className="size-5 text-brand-700" />{s.title}</h2>
      <p className="text-sm text-slate-600">{s.intro}</p>
      {url && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-slate-100 px-2 py-1.5 text-xs" dir="ltr" data-testid="trip-share-url">{url}</code>
          <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); }}>{copied ? s.copied : s.copy}</Button>
          <Button size="sm" variant="secondary" onClick={() => void shareIt()}>{s.share}</Button>
        </div>
      )}
      {err && <Alert tone="error">{err}</Alert>}
      <Button size="sm" onClick={() => void create()} loading={busy} data-testid="trip-share-create">{s.create}</Button>
      {links.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600">{s.active}</p>
          <ul className="mt-1 divide-y divide-slate-100 text-xs">
            {links.map((l) => (
              <li key={l.ref} className="flex items-center justify-between gap-2 py-1.5" data-testid="trip-share-link">
                <span className="text-slate-600">{fmt(s.until, { date: fmtDay(l.expiresAt.slice(0, 10), locale, { day: "numeric", month: "long" }) })}</span>
                <button type="button" onClick={async () => { await fetch(`/api/bookings/${bookingId}/share?ref=${l.ref}`, { method: "DELETE" }); void load(); }} className="font-semibold text-red-700 hover:underline" data-testid="trip-share-revoke">{s.revoke}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
