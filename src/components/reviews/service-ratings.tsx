"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import type { PublicReview, ReviewSummary, ServiceId } from "@/lib/reviews/types";
import { useApp } from "../app-provider";
import { ShieldIcon } from "../icons";
import { Alert, Card, Spinner } from "../ui";
import { RatingStars, ReviewCard } from "./shared";

interface Data {
  overall: { avg: number; count: number };
  services: { id: ServiceId; nameAr: string; nameEn: string; summary: ReviewSummary; recent: PublicReview[] }[];
}

/** Public «Service ratings» page: verified ratings of every Saudi Trip service. */
export function ServiceRatings() {
  const { t, locale, user } = useApp();
  const r = t.reviews;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/reviews/services").then((x) => (x.ok ? x.json() : Promise.reject())).then(setData).catch(() => setError(true));
  }, []);

  if (error) return <Alert tone="error">{r.errors.generic}</Alert>;
  if (!data) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-brand-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-bold sm:text-3xl">{r.servicesTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-brand-100">{r.servicesIntro}</p>
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-100"><ShieldIcon className="size-4" />{r.verifiedHint}</p>
          </div>
          <div className="rounded-xl bg-white/10 px-6 py-4 text-center" data-testid="services-overall">
            <p className="text-xs text-brand-100">{r.servicesOverall}</p>
            <p className="mt-1 text-4xl font-bold">{data.overall.avg.toFixed(1)}<span className="text-base font-medium text-brand-100"> / 5</span></p>
            <RatingStars value={data.overall.avg} className="mt-1" />
            <p className="mt-1 text-xs text-brand-100">{fmt(r.basedOn, { n: data.overall.count })}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {data.services.map((s) => (
          <Card key={s.id} className="flex flex-col p-5" data-testid={`service-${s.id}`}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-bold">{locale === "ar" ? s.nameAr : s.nameEn}</h2>
              <div className="text-end">
                <p className="text-2xl font-bold text-ink">{s.summary.count ? s.summary.avg.toFixed(1) : "—"}</p>
                <p className="text-xs text-slate-500">{fmt(r.count, { n: s.summary.count })}</p>
              </div>
            </div>
            {s.summary.count > 0 && <RatingStars value={s.summary.avg} className="mt-1" />}
            {Object.keys(s.summary.criteria).length > 0 && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                {Object.entries(s.summary.criteria).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 p-2">
                    <dt className="text-slate-500">{(r.criteria as Record<string, string>)[k]}</dt>
                    <dd className="ltr-nums mt-0.5 font-bold text-ink">{v.toFixed(1)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {s.recent.length > 0 && (
              <div className="mt-3 border-t border-slate-100">
                <p className="pt-3 text-xs font-semibold text-slate-500">{r.recent}</p>
                {s.recent.slice(0, 2).map((rv) => <ReviewCard key={rv.id} review={rv} />)}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-slate-600">{r.intro}</p>
        <Link href={user ? `/${locale}/account/reviews` : `/${locale}/login?next=/${locale}/account/reviews`} className="inline-flex h-11 items-center rounded-lg bg-brand-800 px-5 text-sm font-semibold text-white hover:bg-brand-900">
          {r.rateServices}
        </Link>
      </Card>
    </div>
  );
}
