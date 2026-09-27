"use client";

import { useEffect, useState } from "react";
import { useApp } from "../app-provider";
import { Card } from "../ui";

interface Prefs { eventSuggestions: boolean; dailyProgramme: boolean }

/** The optional trip alerts (weather hazards and booked-event alerts are always on). */
export function AlertPrefsCard() {
  const { t } = useApp();
  const m = t.account.notifications;
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    fetch("/api/alerts/prefs").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPrefs(d.prefs)).catch(() => undefined);
  }, []);
  async function toggle(key: keyof Prefs, value: boolean) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
    await fetch("/api/alerts/prefs", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ [key]: value }) }).catch(() => undefined);
  }
  if (!prefs) return null;
  return (
    <Card className="space-y-3 p-5" data-testid="alert-prefs">
      <h2 className="font-bold">{m.prefsTitle}</h2>
      {(["dailyProgramme", "eventSuggestions"] as const).map((k) => (
        <label key={k} className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-700" checked={prefs[k]} onChange={(e) => void toggle(k, e.target.checked)} data-testid={`pref-${k}`} />
          <span><span className="font-semibold">{m.prefs[k].title}</span><span className="block text-xs text-slate-500">{m.prefs[k].desc}</span></span>
        </label>
      ))}
      <p className="text-xs text-slate-500">{m.prefsNote}</p>
    </Card>
  );
}
