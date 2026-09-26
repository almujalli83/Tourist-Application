"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import { readGuestPlan, writeGuestPlan } from "@/lib/planner/handoff";
import type { TripPlan } from "@/lib/planner/types";
import { useApp } from "../app-provider";
import { Alert, Badge, Button, Card, Spinner } from "../ui";
import { PlanEditor } from "./plan-editor";
import { PlanForm } from "./plan-form";

interface PlanRow { id: string; departureDate: string; returnDate: string; stays: { city: string; nights: number }[]; status: "draft" | "booked"; bookingReference: string | null; totalSAR: number }

function Inner() {
  const { t, locale, user, money } = useApp();
  const pl = t.planner;
  const router = useRouter();
  const importing = useSearchParams().get("import") === "1";
  const [info, setInfo] = useState<{ mode: "live" | "sandbox"; cities: string[]; remaining: number } | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<PlanRow[] | null>(null);
  const [draft, setDraft] = useState<TripPlan | null>(null);
  const [busyImport, setBusyImport] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/planner/generate", { cache: "no-store" }).then((r) => r.json()).then(setInfo).catch(() => {});
    setDraft(readGuestPlan());
  }, []);

  const loadRows = useCallback(() => {
    if (!user) return setRows(null);
    fetch("/api/planner/plans", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { plans: [] })).then((d) => setRows(d.plans));
  }, [user]);
  useEffect(loadRows, [loadRows]);

  // A plan made before signing in is saved to the account once the traveller is signed in.
  useEffect(() => {
    if (!user || !draft || draft.id || busyImport) return;
    if (!importing) return;
    setBusyImport(true);
    fetch("/api/planner/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: draft }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "invalidPlan");
        writeGuestPlan(null);
        router.replace(`/${locale}/planner/${d.plan.id}`);
      })
      .catch((e: Error) => {
        setErr((pl.errors as Record<string, string>)[e.message] ?? pl.errors.invalidPlan);
        setBusyImport(false);
      });
  }, [user, draft, importing, busyImport, router, locale, pl.errors]);

  function onGenerated(p: TripPlan, w: string | null, remaining: number) {
    setPlan(p);
    setWarning(w);
    setInfo((i) => (i ? { ...i, remaining } : i));
    window.scrollTo({ top: 0 });
    if (p.id) window.history.replaceState(null, "", `/${locale}/planner/${p.id}`);
    else writeGuestPlan(p);
  }

  function reset() {
    setPlan(null);
    setWarning(null);
    if (!user) writeGuestPlan(null);
    setDraft(null);
    window.history.replaceState(null, "", `/${locale}/planner`);
    loadRows();
  }

  async function remove(id: string) {
    if (!confirm(pl.myPlans.confirmDelete)) return;
    await fetch(`/api/planner/plans/${id}`, { method: "DELETE" });
    loadRows();
  }

  if (busyImport) return <div className="grid place-items-center gap-3 py-20 text-slate-600"><Spinner className="size-8 text-brand-700" />{pl.myPlans.importing}</div>;
  if (plan) return <PlanEditor initial={plan} warning={warning} onNew={reset} />;

  const cityList = (stays: PlanRow["stays"]) => stays.map((s) => SAUDI_CITIES.find((c) => c.code === s.city)?.[locale] ?? s.city).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">{pl.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{pl.subtitle}</p>
        {info && <p className="mt-2 text-xs text-slate-500">{fmt(pl.remaining, { n: info.remaining })}</p>}
      </div>
      {info?.mode === "sandbox" && <Alert tone="warning">{pl.sandbox}</Alert>}
      {err && <Alert tone="error">{err}</Alert>}
      {draft && !draft.id && (
        <Alert tone="info">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span>{pl.myPlans.guestDraft}</span>
            {user ? (
              <Button size="sm" onClick={() => router.replace(`/${locale}/planner?import=1`)}>{pl.myPlans.continueDraft}</Button>
            ) : (
              <Button size="sm" onClick={() => setPlan(draft)}>{pl.myPlans.continueDraft}</Button>
            )}
          </span>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <PlanForm cities={info?.cities ?? null} onGenerated={onGenerated} />
        {user && (
          <Card className="h-fit p-5">
            <h2 className="font-bold">{pl.myPlans.title}</h2>
            {!rows && <div className="grid place-items-center py-6"><Spinner className="size-5 text-brand-700" /></div>}
            {rows?.length === 0 && <p className="mt-2 text-sm text-slate-500">{pl.myPlans.empty}</p>}
            <ul className="mt-3 space-y-2">
              {rows?.map((r) => (
                <li key={r.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{cityList(r.stays)}</p>
                    <Badge tone={r.status === "booked" ? "brand" : "slate"}>{r.status === "booked" ? pl.myPlans.booked : pl.myPlans.draft}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{fmtDay(r.departureDate, locale)} → {fmtDay(r.returnDate, locale)} · {money(r.totalSAR)}</p>
                  <div className="mt-2 flex gap-3 text-xs font-semibold">
                    <Link href={`/${locale}/planner/${r.id}`} className="text-brand-700 hover:underline">{pl.myPlans.open}</Link>
                    {r.status === "draft" && <button type="button" onClick={() => remove(r.id)} className="text-red-700 hover:underline">{pl.myPlans.delete}</button>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

export function PlannerView() {
  return <Suspense><Inner /></Suspense>;
}

/** A saved plan (/planner/[id]). */
export function SavedPlanView({ id }: { id: string }) {
  const { t, locale, user } = useApp();
  const pl = t.planner;
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    fetch(`/api/planner/plans/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "generic");
        setPlan(d.plan);
      })
      .catch((e: Error) => setError((pl.errors as Record<string, string>)[e.message] ?? pl.errors.generic));
  }, [id, user, pl.errors]);
  if (!user)
    return (
      <Card className="mx-auto max-w-md space-y-3 p-6 text-center">
        <p className="text-sm text-slate-600">{pl.plan.approve.loginFirst}</p>
        <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/planner/${id}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white">{pl.plan.approve.login}</Link>
      </Card>
    );
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!plan) return <div className="grid place-items-center py-20"><Spinner className="size-8 text-brand-700" /></div>;
  return <PlanEditor initial={plan} />;
}
