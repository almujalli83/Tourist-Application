"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cityName } from "@/lib/data/cities";
import type { PublicGuide } from "@/lib/guides/types";
import type { Interest } from "@/lib/planner/types";
import { useApp } from "../app-provider";
import { UsersIcon } from "../icons";
import { Card } from "../ui";
import { GuideCard } from "./guide-card";

const TRACKS: Record<Interest, string[]> = {
  heritage: ["heritage"], culture: ["culture"], nature: ["nature"], beach: ["diving"], adventure: ["adventure", "desert"],
  shopping: ["city"], food: ["food"], entertainment: ["city"], religious: ["religious"],
};

/** Licensed guides suggested for a trip plan: its cities, the traveller's language, the interests. */
export function PlanGuides({ cities, interests }: { cities: string[]; interests: Interest[] }) {
  const { t, locale } = useApp();
  const s = t.guides.suggest;
  const [data, setData] = useState<Record<string, PublicGuide[]> | null>(null);
  const key = `${cities.join(",")}|${interests.join(",")}|${locale}`;
  useEffect(() => {
    const tracks = [...new Set(interests.flatMap((i) => TRACKS[i] ?? []))];
    fetch(`/api/guides/suggest?cities=${cities.join(",")}&language=${locale}&tracks=${tracks.join(",")}`)
      .then((r) => r.json()).then((d) => setData(d.guides ?? {})).catch(() => setData({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const rows = Object.entries(data ?? {}).filter(([, list]) => list.length);
  if (!rows.length) return null;
  return (
    <Card className="p-5 print:hidden" data-testid="plan-guides">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-bold"><UsersIcon className="size-5 text-brand-700" />{s.title}</h2>
          <p className="text-sm text-slate-600">{s.hint}</p>
        </div>
        <Link href={`/${locale}/guides`} className="text-sm font-semibold text-brand-700 hover:underline">{s.all}</Link>
      </div>
      {rows.map(([city, list]) => (
        <div key={city} className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-slate-600">{cityName(city, locale)}</h3>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((g) => <GuideCard key={g.licenseNo} g={g} highlightLang={locale} compact />)}
          </div>
        </div>
      ))}
    </Card>
  );
}
