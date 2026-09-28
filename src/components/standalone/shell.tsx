"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ENTRY_TYPES, isEntryType, type EntryType } from "@/lib/standalone/entry";
import { useApp } from "../app-provider";
import { HotelIcon, PlaneIcon } from "../icons";
import { Card, cx, Select } from "../ui";

const KEY = "ta_entry";

/** The traveller's entry type, kept on the device and shared by the hotel and flight pages. */
export function useEntry(): [EntryType, (e: EntryType) => void] {
  const [entry, setEntry] = useState<EntryType>("evisa");
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(location.search).get("entry");
      const saved = fromUrl ?? localStorage.getItem(KEY);
      if (isEntryType(saved)) setEntry(saved);
    } catch {
      // storage unavailable: keep the default
    }
  }, []);
  const set = (e: EntryType) => {
    setEntry(e);
    try {
      localStorage.setItem(KEY, e);
    } catch {
      // ignore
    }
  };
  return [entry, set];
}

/** Title, the hotels / flights tabs and "how are you travelling?". */
export function StandaloneShell({ tab, entry, onEntry, children }: { tab: "hotels" | "flights"; entry: EntryType; onEntry: (e: EntryType) => void; children: ReactNode }) {
  const { t, locale } = useApp();
  const s = t.standalone;
  const tabs = [
    { id: "hotels", href: `/${locale}/hotels`, label: s.tabs.hotels, icon: <HotelIcon className="size-4" /> },
    { id: "flights", href: `/${locale}/flights`, label: s.tabs.flights, icon: <PlaneIcon className="size-4" /> },
  ] as const;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{s.title}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{s.intro}</p>
      </div>
      <nav className="flex gap-2" aria-label={s.title}>
        {tabs.map((x) => (
          <Link key={x.id} href={`${x.href}?entry=${entry}`} aria-current={tab === x.id ? "page" : undefined}
            className={cx("inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold", tab === x.id ? "bg-brand-700 text-white" : "bg-white text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50")} data-testid={`sa-tab-${x.id}`}>
            {x.icon}{x.label}
          </Link>
        ))}
      </nav>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <label htmlFor="sa-entry" className="shrink-0 text-sm font-semibold">{s.entry.label}</label>
        <Select id="sa-entry" value={entry} onChange={(e) => onEntry(e.target.value as EntryType)} className="sm:max-w-xs" data-testid="sa-entry">
          {ENTRY_TYPES.map((e) => <option key={e} value={e}>{s.entry.types[e]}</option>)}
        </Select>
        <p className="text-sm text-slate-600">
          {s.entry.hints[entry]}{" "}
          {entry === "evisa" && <><Link href={`/${locale}/evisa`} className="font-semibold text-brand-700 underline" data-testid="sa-evisa-link">{s.entry.evisaLink}</Link>{" "}</>}
          {(entry === "evisa" || entry === "arrival") && <Link href={`/${locale}/package-visa`} className="font-semibold text-brand-700 underline">{s.entry.packageLink}</Link>}
        </p>
      </Card>
      {children}
    </div>
  );
}

export const errText = (errors: Record<string, string>, code: unknown) => errors[String(code)] ?? errors.generic;
