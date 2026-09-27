"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtKsa } from "@/lib/events/format";
import type { GuideBooking } from "@/lib/guides/bookings";
import type { ImportResult } from "@/lib/guides/guides";
import type { PublicGuide } from "@/lib/guides/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { GUIDE_STATUS_TONE } from "./guide-booking-view";
import { langLabel } from "./guide-card";

type Row = PublicGuide & { source: string; updatedAt: string; licensed: boolean; removed: boolean };

/** Back office — licensed guides: MoT link, CSV import, the register and the requests. */
export function AdminGuides() {
  const { t, locale } = useApp();
  const s = t.guides;
  const a = s.admin;
  const [data, setData] = useState<{ guides: Row[]; bookings: GuideBooking[]; mtConfigured: boolean } | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/guides", { cache: "no-store" });
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => void load(), [load]);

  const report = (r: ImportResult) => setMsg({ tone: "success", text: fmt(a.result, { imported: r.imported, expired: r.skippedExpired, invalid: r.invalid, removed: r.removed }) });
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/guides/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv: await file.text(), full }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: s.errors.generic });
    report(d.result);
    void load();
  }
  async function sync() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/guides/sync", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: s.errors.generic });
    report(d.result);
    void load();
  }

  return (
    <div className="space-y-6" data-testid="admin-guides">
      <BackLink href={`/${locale}/admin`} label={t.admin.nav} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{a.intro}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="font-bold">{a.mt}</h2>
          <p className="text-sm"><Badge tone={data?.mtConfigured ? "brand" : "amber"}>{data?.mtConfigured ? a.mtOn : a.mtOff}</Badge></p>
          {data?.mtConfigured && <Button variant="secondary" loading={busy} onClick={sync}>{a.syncNow}</Button>}
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="font-bold">{a.import}</h2>
          <p className="text-xs text-slate-500" dir="ltr">{a.importHint}</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />{a.full}</label>
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} data-testid="guides-import" className="block text-sm" />
        </Card>
      </div>
      {msg && <Alert tone={msg.tone}><span data-testid="guides-import-result">{msg.text}</span></Alert>}
      {!data ? (
        <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : (
        <>
          <Card className="overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-bold">{a.guides} ({data.guides.length})</h2>
            <table className="mt-2 w-full min-w-[720px] text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.guides.map((g) => (
                  <tr key={g.licenseNo} data-testid="admin-guide-row">
                    <td className="px-5 py-2.5 font-semibold">{locale === "ar" ? g.nameAr : g.nameEn}{g.demo && <Badge tone="gold" className="ms-2">{s.sample}</Badge>}</td>
                    <td className="px-3 py-2.5 ltr-nums" dir="ltr">{g.licenseNo}</td>
                    <td className="px-3 py-2.5 ltr-nums">{g.licenseExpiry}</td>
                    <td className="px-3 py-2.5">{g.cities.map((c) => cityName(c, locale)).join("، ")}</td>
                    <td className="px-3 py-2.5">{g.languages.map((l) => langLabel(l.code, locale)).join("، ")}</td>
                    <td className="px-3 py-2.5"><Badge tone={g.licensed ? "brand" : "red"}>{g.removed ? a.removed : g.licensed ? a.licensed : a.expired}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-bold">{a.requests} ({data.bookings.length})</h2>
            {data.bookings.length === 0 ? <p className="px-5 py-4 text-sm text-slate-500">{a.noRequests}</p> : (
              <table className="mt-2 w-full min-w-[720px] text-sm">
                <tbody className="divide-y divide-slate-100">
                  {data.bookings.map((b) => (
                    <tr key={b.id}>
                      <td className="px-5 py-2.5 ltr-nums" dir="ltr">{b.reference}</td>
                      <td className="px-3 py-2.5">{locale === "ar" ? b.guide.nameAr : b.guide.nameEn}</td>
                      <td className="px-3 py-2.5">{b.userName}</td>
                      <td className="px-3 py-2.5 ltr-nums">{b.date} {b.startTime}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtKsa(b.createdAt, locale, { day: "numeric", month: "short" })}</td>
                      <td className="px-3 py-2.5"><Badge tone={GUIDE_STATUS_TONE[b.status]}>{s.booking.status[b.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
