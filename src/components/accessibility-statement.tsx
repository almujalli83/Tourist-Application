"use client";

import Link from "next/link";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import { useApp } from "./app-provider";
import { AccessibilityIcon, CheckIcon } from "./icons";
import { Card } from "./ui";

const REVIEWED = "2026-09-27";

export function AccessibilityStatement() {
  const { t, locale } = useApp();
  const a = t.a11y;
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><AccessibilityIcon className="size-7 text-brand-700" />{a.statementTitle}</h1>
      <p className="text-slate-700">{a.statementIntro}</p>
      <Card className="space-y-2 p-5"><h2 className="font-bold">{a.standardTitle}</h2><p className="text-sm text-slate-700">{a.standard}</p></Card>
      <Card className="space-y-2 p-5">
        <h2 className="font-bold">{a.featuresTitle}</h2>
        <ul className="space-y-2 text-sm text-slate-700">{a.features.map((f) => <li key={f} className="flex gap-2"><CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-700" />{f}</li>)}</ul>
      </Card>
      <Card className="space-y-2 p-5"><h2 className="font-bold">{a.limitsTitle}</h2><p className="text-sm text-slate-700">{a.limits}</p></Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-bold">{a.feedbackTitle}</h2>
        <p className="text-sm text-slate-700">{a.feedback}</p>
        <Link href={`/${locale}/support`} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{a.contact}</Link>
      </Card>
      <p className="text-xs text-slate-500">{fmt(a.updated, { date: fmtDay(REVIEWED, locale, { day: "numeric", month: "long", year: "numeric" }) })}</p>
    </div>
  );
}
