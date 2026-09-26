"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeSearch } from "@/lib/guide/search";
import type { PlanItem } from "@/lib/planner/types";
import type { RoomOccupancy } from "@/lib/types";
import { useApp } from "../app-provider";
import { XIcon } from "../icons";
import { Badge, cx, Input, Spinner } from "../ui";

type Filter = "all" | "places" | "restaurants" | "events";

/** Dialog to add an activity to a day or swap one (places, restaurants, events on that date). */
export function ActivityPicker({ title, city, date, rooms, used, mealOnly, onPick, onClose }: {
  title: string; city: string; date: string; rooms: RoomOccupancy[]; used: Set<string>; mealOnly: boolean;
  onPick: (item: PlanItem) => void; onClose: () => void;
}) {
  const { t, locale } = useApp();
  const k = t.planner.picker;
  const p = t.planner.plan;
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(mealOnly ? "restaurants" : "all");
  const [meal, setMeal] = useState<"lunch" | "dinner">("dinner");

  useEffect(() => {
    fetch("/api/planner/candidates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city, date, rooms }) })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, [city, date, rooms]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dining = (i: PlanItem) => i.kind === "restaurant" || i.category === "restaurant" || i.category === "cafe";
  const shown = useMemo(() => {
    const nq = normalizeSearch(q.trim());
    return (items ?? []).filter((i) => {
      if (filter === "places" && (i.kind !== "place" || dining(i))) return false;
      if (filter === "restaurants" && !dining(i)) return false;
      if (filter === "events" && i.kind !== "event") return false;
      return !nq || normalizeSearch(`${i.titleAr} ${i.titleEn}`).includes(nq);
    });
  }, [items, q, filter]);

  return (
    <div className="fixed inset-0 z-[800] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()} data-testid="activity-picker">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="grid size-9 place-items-center rounded-full hover:bg-slate-100"><XIcon className="size-5" /></button>
        </div>
        <div className="space-y-3 border-b border-slate-100 p-4">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={k.search} aria-label={k.search} autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {(["all", "places", "restaurants", "events"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={cx("rounded-full px-3 py-1 text-xs font-semibold", filter === f ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700")}>{k[f]}</button>
            ))}
            {(filter === "restaurants" || filter === "all") && (
              <label className="ms-auto flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                {k.mealSlot}
                <select value={meal} onChange={(e) => setMeal(e.target.value as "lunch" | "dinner")} className="h-7 rounded-md border border-slate-300 px-1.5 text-xs">
                  <option value="lunch">{p.meals.lunch}</option>
                  <option value="dinner">{p.meals.dinner}</option>
                </select>
              </label>
            )}
          </div>
        </div>
        <ul className="min-h-40 flex-1 divide-y divide-slate-100 overflow-y-auto">
          {!items && <li className="grid place-items-center py-10"><Spinner className="size-6 text-brand-700" /></li>}
          {items && shown.length === 0 && <li className="p-6 text-center text-sm text-slate-500">{k.empty}</li>}
          {shown.map((i) => {
            const inPlan = used.has(i.ref.split("@")[0]);
            // A place or event is planned once per trip (restaurants can be visited again).
            const blocked = inPlan && i.kind !== "restaurant";
            return (
              <li key={i.ref} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{locale === "ar" ? i.titleAr : i.titleEn}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
                    {i.kind === "event" ? <Badge tone="brand">{i.fixedStart}</Badge> : dining(i) ? <Badge tone="gold">{t.planner.picker.restaurants}</Badge> : <Badge>{(t.guide.categories as Record<string, string>)[i.category] ?? i.category}</Badge>}
                    {inPlan && <Badge tone="amber">{k.used}</Badge>}
                  </p>
                </div>
                <button type="button" onClick={() => onPick(dining(i) ? { ...i, meal } : { ...i, meal: undefined })} disabled={blocked} className="h-9 shrink-0 rounded-lg bg-brand-700 px-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-40" data-testid="picker-pick">{k.pick}</button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
