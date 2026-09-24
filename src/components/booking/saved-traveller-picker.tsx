"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { countryName } from "@/lib/data/countries";
import { todayISO } from "@/lib/dates";
import { passportStatus, type SavedTraveller, type SavedTravellerSummary } from "@/lib/saved-travellers";
import { useApp } from "../app-provider";
import { UsersIcon } from "../icons";
import { Alert, Card, Select, Spinner } from "../ui";
import { fetchSavedTraveller } from "../saved-travellers-api";

/** Lets a signed-in user fill a traveller form from one of their saved travellers. */
export function SavedTravellerPicker({ id, saved, value, usedIds, arrivalDate, onPick }: {
  id: string;
  saved: SavedTravellerSummary[];
  value: string | null | undefined;
  usedIds: string[];
  arrivalDate: string;
  onPick: (t: SavedTraveller) => void;
}) {
  const { t, locale } = useApp();
  const s = t.travellers.saved;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  if (saved.length === 0) return null;

  const label = (x: SavedTravellerSummary) => {
    const name = (locale === "ar" && x.nameAr) || x.nameEn;
    const parts = [name, countryName(x.nationality, locale), x.passportNoMasked];
    if (x.passportExpiryDate) parts.push(fmt(s.expires, { date: x.passportExpiryDate }));
    return parts.filter(Boolean).join(" · ");
  };

  async function pick(savedId: string) {
    if (!savedId) return;
    setBusy(true);
    setError(false);
    try {
      onPick(await fetchSavedTraveller(savedId));
      setPicked(savedId);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const current = saved.find((x) => x.id === (picked ?? value));
  const status = current ? passportStatus(current.passportExpiryDate, todayISO(), arrivalDate) : "ok";

  return (
    <Card className="border-brand-100 bg-brand-50/60 p-4 sm:p-5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-bold text-brand-800">
        <UsersIcon className="size-5" />
        {s.pickTitle}
      </label>
      <p className="mt-1 text-xs text-slate-600">{s.pickHint}</p>
      <div className="mt-3 flex items-center gap-3">
        <Select id={id} className="bg-white" value={value ?? ""} disabled={busy} onChange={(e) => void pick(e.target.value)}>
          <option value="">{s.pickPlaceholder}</option>
          {saved.map((x) => {
            const inUse = usedIds.includes(x.id) && x.id !== value;
            return (
              <option key={x.id} value={x.id} disabled={inUse}>
                {label(x)}{inUse ? ` (${s.inUse})` : ""}
              </option>
            );
          })}
        </Select>
        {busy && <Spinner className="size-5 text-brand-700" />}
      </div>
      {error && <Alert tone="error" className="mt-3">{s.loadError}</Alert>}
      {picked && picked === value && (
        <Alert tone={status === "ok" ? "success" : "warning"} className="mt-3">
          {status === "expired" ? s.passportExpired : status === "insufficient" ? s.passportInsufficient : s.filledFrom}
        </Alert>
      )}
    </Card>
  );
}
