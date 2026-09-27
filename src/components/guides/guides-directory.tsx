"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { GUIDE_LANGUAGES, GUIDE_TRACKS, type PublicGuide } from "@/lib/guides/types";
import { useApp } from "../app-provider";
import { useSummaries } from "../reviews/shared";
import { SearchIcon, ShieldIcon, UsersIcon } from "../icons";
import { Button, Card, Input, Select, Spinner } from "../ui";
import { GuideCard, langLabel } from "./guide-card";

/** Directory of licensed guides with filters, and the licence check. */
export function GuidesDirectory() {
  const { t, locale } = useApp();
  const g = t.guides;
  const router = useRouter();
  const [f, setF] = useState({ city: "", language: "", track: "", gender: "", q: "" });
  const [list, setList] = useState<PublicGuide[] | null>(null);
  const [license, setLicense] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setF((x) => ({ ...x, city: p.get("city") ?? "", language: p.get("language") ?? "", track: p.get("track") ?? "" }));
  }, []);
  useEffect(() => {
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    const id = setTimeout(() => {
      fetch(`/api/guides?${qs}`).then((r) => r.json()).then((d) => setList(d.guides ?? [])).catch(() => setList([]));
    }, 200);
    return () => clearTimeout(id);
  }, [f]);
  const summaries = useSummaries("guide", (list ?? []).map((x) => x.licenseNo));
  const langs = Object.keys(GUIDE_LANGUAGES).sort((a, b) => langLabel(a, locale).localeCompare(langLabel(b, locale), locale));
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <div className="w-full sm:w-44">
      <Select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={label} data-testid={`guide-filter-${k}`}>
        <option value="">{label}: {g.filters.any}</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><UsersIcon className="size-7 text-brand-700" />{g.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{g.intro}</p>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><ShieldIcon className="size-3.5" />{g.source}</p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          {sel("city", g.filters.city, SAUDI_CITIES.map((c) => [c.code, locale === "ar" ? c.ar : c.en]))}
          {sel("language", g.filters.language, langs.map((c) => [c, langLabel(c, locale)]))}
          {sel("track", g.filters.track, GUIDE_TRACKS.map((x) => [x, g.trackNames[x]]))}
          {sel("gender", g.filters.gender, [["male", g.filters.male], ["female", g.filters.female]])}
          <div className="relative min-w-0 flex-1 basis-56">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder={g.filters.q} aria-label={g.filters.q} className="ps-9" data-testid="guide-filter-q" />
          </div>
        </div>
      </Card>

      {!list ? (
        <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-8" /></div>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">{g.none}</Card>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-600" data-testid="guide-count">{fmt(g.count, { n: list.length })}</p>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((x) => <GuideCard key={x.licenseNo} g={x} summary={summaries[x.licenseNo]} highlightLang={f.language || undefined} />)}
          </div>
        </>
      )}

      <Card className="p-5" data-testid="guide-verify-form">
        <h2 className="flex items-center gap-2 font-bold"><ShieldIcon className="size-5 text-brand-700" />{g.verifyTitle}</h2>
        <p className="mt-1 text-sm text-slate-600">{g.verifyHint}</p>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (license.trim()) router.push(`/${locale}/verify/guide/${encodeURIComponent(license.trim())}`); }}>
          <div className="min-w-0 flex-1 basis-56"><Input value={license} onChange={(e) => setLicense(e.target.value)} placeholder={g.license} aria-label={g.license} dir="ltr" data-testid="guide-verify-input" /></div>
          <Button type="submit" data-testid="guide-verify-btn">{g.verifyBtn}</Button>
        </form>
      </Card>
    </div>
  );
}
