"use client";

import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtKsa } from "@/lib/events/format";
import { REVIEW_TARGETS, type ModerationReason, type PublicReview, type ReviewStatus, type ReviewSummary, type ReviewTarget } from "@/lib/reviews/types";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { Alert, Badge, Button, Card, cx, Input, Spinner, Textarea } from "../ui";
import { RatingStars, ReviewCard } from "./shared";

type Row = PublicReview & { status: ReviewStatus; moderation: { by: string; reason: ModerationReason | null; note: string | null; at: string }; sourceRef: string };
interface Stats {
  byStatus: Record<ReviewStatus, number>;
  byType: Record<ReviewTarget, ReviewSummary>;
  followUp: { targetType: ReviewTarget; targetId: string; nameAr: string; nameEn: string; summary: ReviewSummary }[];
}
const TABS = ["pending", "published", "rejected", "all"] as const;
const TONE = { published: "brand", pending: "amber", rejected: "red" } as const;

function AdminRow({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const { t, locale } = useApp();
  const r = t.reviews;
  const a = r.admin;
  const [note, setNote] = useState("");
  const [reply, setReply] = useState(row.reply?.text ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  async function act(body: Record<string, string>) {
    setBusy(body.action);
    setErr(false);
    try {
      const res = await fetch(`/api/admin/reviews/${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) return setErr(true);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4" data-testid="admin-review">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone={TONE[row.status]}>{r.status[row.status]}</Badge>
        <Badge>{r.targets[row.targetType]}</Badge>
        <span className="font-semibold text-ink">{locale === "ar" ? row.targetNameAr : row.targetNameEn}</span>
        <span className="text-slate-500">· {r.source}: {row.sourceRef}</span>
        {row.moderation.reason && <span className="text-amber-700">· {a.reason}: {r.reasons[row.moderation.reason]}</span>}
        {row.demo && <Badge>{r.sample}</Badge>}
      </div>
      <ReviewCard review={row} />
      {row.moderation.note && <p className="text-xs text-slate-500">{row.moderation.note} · {fmtKsa(row.moderation.at, locale, { dateStyle: "medium" })}</p>}
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {row.status !== "published" && <Button size="sm" loading={busy === "approve"} onClick={() => act({ action: "approve" })} data-testid="admin-approve">{a.approve}</Button>}
          {row.status !== "rejected" && (
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={a.rejectNote} aria-label={a.rejectNote} />
              <Button size="sm" variant="secondary" loading={busy === "reject"} onClick={() => act({ action: "reject", note })}>{a.reject}</Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder={a.replyPlaceholder} aria-label={a.reply} dir="auto" />
          <Button size="sm" variant="secondary" loading={busy === "reply"} onClick={() => act({ action: "reply", text: reply })} data-testid="admin-reply">{a.saveReply}</Button>
        </div>
      </div>
      {err && <Alert tone="error" className="mt-2">{r.errors.generic}</Alert>}
    </Card>
  );
}

/** Back office — review moderation, official replies and follow-up of low-rated establishments. */
export function AdminReviews() {
  const { t, locale } = useApp();
  const r = t.reviews;
  const a = r.admin;
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending");
  const [data, setData] = useState<{ reviews: Row[]; stats: Stats } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/reviews?status=${tab}`, { cache: "no-store" });
    if (!res.ok) return setError(true);
    setData(await res.json());
  }, [tab]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/admin`} label={t.admin.nav} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{a.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{a.intro}</p>
      </div>
      {error && <Alert tone="error">{r.errors.generic}</Alert>}
      {!data ? (
        <div className="grid min-h-[30vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["pending", "published", "rejected"] as const).map((s) => (
              <Card key={s} className="p-4">
                <p className="text-xs text-slate-500">{a.tabs[s]}</p>
                <p className="mt-1 text-2xl font-bold" data-testid={`admin-count-${s}`}>{data.stats.byStatus[s]}</p>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-2 text-sm font-bold">{a.byType}</p>
              <ul className="space-y-1.5 text-sm">
                {REVIEW_TARGETS.map((k) => (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <span>{r.targets[k]}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {data.stats.byType[k].count > 0 && <RatingStars value={data.stats.byType[k].avg} size="size-3" />}
                      <b className="ltr-nums text-ink">{data.stats.byType[k].count ? data.stats.byType[k].avg.toFixed(1) : "—"}</b>
                      ({fmt(r.count, { n: data.stats.byType[k].count })})
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-sm font-bold">{a.followUp}</p>
              {data.stats.followUp.length === 0 ? (
                <p className="text-sm text-slate-500">{a.followUpEmpty}</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.stats.followUp.map((f) => (
                    <li key={`${f.targetType}:${f.targetId}`} className="flex items-center justify-between gap-2">
                      <span>{r.targets[f.targetType]} · {locale === "ar" ? f.nameAr : f.nameEn}</span>
                      <b className="text-red-700">{f.summary.avg.toFixed(1)} ({f.summary.count})</b>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("h-9 rounded-full px-4 text-sm font-semibold", tab === k ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50")}>
                {a.tabs[k]}{k !== "all" && ` (${data.stats.byStatus[k]})`}
              </button>
            ))}
          </div>
          {data.reviews.length === 0 ? (
            <Card className="p-6 text-sm text-slate-500">{a.empty}</Card>
          ) : (
            <div className="space-y-3">{data.reviews.map((row) => <AdminRow key={row.id} row={row} onChanged={load} />)}</div>
          )}
        </>
      )}
    </div>
  );
}
