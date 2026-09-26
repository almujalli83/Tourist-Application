"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { countryName } from "@/lib/data/countries";
import { fmtKsa } from "@/lib/events/format";
import type { PublicReview, ReviewSummary, ReviewTarget } from "@/lib/reviews/types";
import { useApp } from "../app-provider";
import { ShieldIcon } from "../icons";
import { Badge, cx } from "../ui";

const STAR = "m10 1.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.8l-5.2 2.7 1-5.8L1.6 7.6l5.8-.8z";

/** Read-only stars, with fractional fill (e.g. 4.6). */
export function RatingStars({ value, size = "size-4", className }: { value: number; size?: string; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} / 5`} role="img">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className={cx("relative inline-block", size)} aria-hidden>
            <svg viewBox="0 0 20 20" className="absolute inset-0 size-full text-slate-300" fill="currentColor"><path d={STAR} /></svg>
            <span className="absolute inset-y-0 start-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 20 20" className={cx("text-gold-500", size)} fill="currentColor"><path d={STAR} /></svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Interactive 1–5 star input (radio group, keyboard accessible). */
export function StarInput({ value, onChange, label, size = "size-8", name }: { value: number; onChange: (n: number) => void; label: string; size?: string; name: string }) {
  const { t } = useApp();
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-1" onMouseLeave={() => setHover(0)} data-testid={`stars-${name}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} — ${t.reviews.labels[n - 1]}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n && name !== "overall" ? 0 : n)}
            className="rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <svg viewBox="0 0 20 20" className={cx(size, n <= shown ? "text-gold-500" : "text-slate-300", "transition-colors")} fill="currentColor"><path d={STAR} /></svg>
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-semibold text-slate-700">{t.reviews.labels[shown - 1]}</span>}
    </div>
  );
}

/** Compact average rating: ★ 4.6 (23). */
export function RatingBadge({ summary, className, light }: { summary?: ReviewSummary | null; className?: string; light?: boolean }) {
  const { t } = useApp();
  if (!summary?.count) return null;
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs", light ? "text-white" : "text-slate-600", className)} title={t.reviews.verifiedHint} data-testid="rating-badge">
      <svg viewBox="0 0 20 20" className="size-3.5 text-gold-500" fill="currentColor" aria-hidden><path d={STAR} /></svg>
      <span className={cx("font-bold", light ? "text-white" : "text-ink")}>{summary.avg.toFixed(1)}</span>
      <span>({fmt(t.reviews.count, { n: summary.count })})</span>
    </span>
  );
}

/** Rating summaries of several targets of one kind (for lists). */
export function useSummaries(type: ReviewTarget, ids: string[]): Record<string, ReviewSummary> {
  const [map, setMap] = useState<Record<string, ReviewSummary>>({});
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    fetch(`/api/reviews/summary?type=${type}&ids=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setMap(d.summaries))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [type, key]);
  return map;
}

/** Average, distribution and criteria of a target. */
export function SummaryPanel({ summary, type, onFilter, filter }: { summary: ReviewSummary; type: ReviewTarget; onFilter?: (n: number) => void; filter?: number }) {
  const { t } = useApp();
  const r = t.reviews;
  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr_1fr]">
      <div className="text-center sm:text-start">
        <p className="text-4xl font-bold text-ink">{summary.avg.toFixed(1)}<span className="text-base font-medium text-slate-400"> / 5</span></p>
        <RatingStars value={summary.avg} className="mt-1" />
        <p className="mt-1 text-xs text-slate-500">{fmt(r.basedOn, { n: summary.count })}</p>
      </div>
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((n) => {
          const c = summary.distribution[n - 1];
          const pct = summary.count ? Math.round((c / summary.count) * 100) : 0;
          return (
            <button
              key={n}
              type="button"
              disabled={!onFilter || !c}
              onClick={() => onFilter?.(filter === n ? 0 : n)}
              className={cx("flex w-full items-center gap-2 rounded text-xs", filter === n && "font-bold text-brand-800")}
              aria-pressed={filter === n}
            >
              <span className="w-12 shrink-0 text-start">{fmt(r.stars, { n })}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} /></span>
              <span className="ltr-nums w-8 shrink-0 text-end text-slate-500">{c}</span>
            </button>
          );
        })}
      </div>
      {Object.keys(summary.criteria).length > 0 && (
        <dl className="space-y-1.5 text-xs">
          {Object.entries(summary.criteria).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-2">
              <dt className="text-slate-600">{(r.criteria as Record<string, string>)[k] ?? k}</dt>
              <dd className="flex items-center gap-1.5"><RatingStars value={v} size="size-3" /><span className="ltr-nums font-semibold">{v.toFixed(1)}</span></dd>
            </div>
          ))}
        </dl>
      )}
      <span className="sr-only">{r.targets[type]}</span>
    </div>
  );
}

export function ReviewCard({ review: rv, showTarget }: { review: PublicReview; showTarget?: boolean }) {
  const { t, locale } = useApp();
  const r = t.reviews;
  const other = rv.lang !== locale ? rv.translation[locale] : undefined;
  const [translated, setTranslated] = useState(!!other);
  const text = translated && other ? other : rv.comment;
  return (
    <article className="space-y-2 border-b border-slate-100 py-4 last:border-0" data-testid="review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">{rv.authorName.slice(0, 1)}</span>
          <div>
            <p className="text-sm font-semibold text-ink">{rv.authorName}{rv.authorCountry && <span className="font-normal text-slate-500"> · {countryName(rv.authorCountry, locale)}</span>}</p>
            <p className="text-xs text-slate-500">{fmtKsa(rv.createdAt, locale, { day: "numeric", month: "long", year: "numeric" })}{showTarget && ` · ${locale === "ar" ? rv.targetNameAr : rv.targetNameEn}`}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand"><ShieldIcon className="me-1 inline size-3" />{r.verified}</Badge>
          {rv.demo && <Badge>{r.sample}</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <RatingStars value={rv.rating} />
        <span className="text-xs font-semibold text-slate-600">{r.labels[rv.rating - 1]}</span>
      </div>
      {Object.keys(rv.criteria).length > 0 && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          {Object.entries(rv.criteria).map(([k, v]) => <span key={k}>{(r.criteria as Record<string, string>)[k] ?? k}: <b className="ltr-nums text-slate-700">{v}/5</b></span>)}
        </p>
      )}
      {text && <p className="whitespace-pre-line text-sm leading-7 text-slate-800" dir="auto">{text}</p>}
      {other && other !== rv.comment && (
        <button type="button" onClick={() => setTranslated((x) => !x)} className="text-xs font-semibold text-brand-700 underline">
          {translated ? r.showOriginal : r.showTranslation}
        </button>
      )}
      {rv.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rv.photos.map((p) => (
            <a key={p.id} href={`/api/reviews/photos/${rv.id}/${p.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/reviews/photos/${rv.id}/${p.id}`} alt="" className="size-20 rounded-lg object-cover ring-1 ring-slate-200" />
            </a>
          ))}
        </div>
      )}
      {rv.reply && (
        <div className="ms-4 rounded-lg border-s-4 border-brand-600 bg-brand-50/60 p-3 text-sm">
          <p className="text-xs font-bold text-brand-800">{locale === "ar" ? rv.reply.byAr : rv.reply.byEn}</p>
          <p className="mt-1 leading-6 text-slate-700" dir="auto">{rv.reply.text}</p>
        </div>
      )}
    </article>
  );
}

/** «Traveller reviews» of a target: summary, star filter and the reviews (10 at a time). */
export function ReviewsSection({ type, id, className }: { type: ReviewTarget; id: string; className?: string }) {
  const { t } = useApp();
  const r = t.reviews;
  const [data, setData] = useState<{ summary: ReviewSummary; total: number; reviews: PublicReview[] } | null>(null);
  const [filter, setFilter] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/reviews?type=${type}&id=${encodeURIComponent(id)}${filter ? `&rating=${filter}` : ""}`)
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => alive && d && setData(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [type, id, filter]);

  async function more() {
    if (!data) return;
    setBusy(true);
    try {
      const d = await (await fetch(`/api/reviews?type=${type}&id=${encodeURIComponent(id)}&offset=${data.reviews.length}${filter ? `&rating=${filter}` : ""}`)).json();
      setData({ ...data, reviews: [...data.reviews, ...d.reviews] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white p-5", className)} data-testid="reviews-section" aria-labelledby={`reviews-${type}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`reviews-${type}`} className="font-bold">{r.sectionTitle}</h2>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500"><ShieldIcon className="size-3.5 text-brand-700" />{r.verifiedHint}</span>
      </div>
      {!data ? (
        <div className="h-24 animate-pulse rounded-lg bg-slate-50" />
      ) : data.summary.count === 0 ? (
        <p className="text-sm text-slate-500">{r.none}</p>
      ) : (
        <>
          <SummaryPanel summary={data.summary} type={type} onFilter={setFilter} filter={filter} />
          <div className="mt-4 border-t border-slate-100">
            {data.reviews.map((rv) => <ReviewCard key={rv.id} review={rv} />)}
          </div>
          {data.reviews.length < data.total && (
            <button type="button" onClick={more} disabled={busy} className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-brand-800 hover:bg-slate-50">
              {r.loadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}
