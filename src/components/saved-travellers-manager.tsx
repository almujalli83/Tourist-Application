"use client";

import { useState } from "react";
import { fmt } from "@/i18n";
import { countryName } from "@/lib/data/countries";
import { todayISO } from "@/lib/dates";
import { passportStatus, pickSavedData, validateSavedTraveller, type SavedTravellerSummary } from "@/lib/saved-travellers";
import type { Traveller } from "@/lib/types";
import { emptyTraveller } from "@/lib/visa-validation";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { TravellerForm } from "./booking/traveller-form";
import { PassportIcon, ShieldIcon, UserIcon } from "./icons";
import { deleteSavedTraveller, fetchSavedTraveller, saveTraveller, SaveTravellerError, useSavedTravellers } from "./saved-travellers-api";
import { Alert, Badge, Button, Card, Spinner } from "./ui";

const STATUS_TONE = { ok: "brand", insufficient: "gold", expired: "red", unknown: "slate" } as const;

/** Account page listing the user's saved travellers, with add / edit / delete. */
export function SavedTravellersManager() {
  const { t, locale, user } = useApp();
  const a = t.account.travellers;
  const { list, loading, reload } = useSavedTravellers(true);
  const [editing, setEditing] = useState<{ id: string | null; tr: Traveller } | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const today = todayISO();
  const defaultNationality = user?.individual?.nationality || "SA";

  function open(id: string | null, tr: Traveller) {
    setEditing({ id, tr });
    setServerErrors({});
    setShowErrors(false);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function edit(x: SavedTravellerSummary) {
    setBusy(x.id);
    try {
      const s = await fetchSavedTraveller(x.id);
      open(x.id, { ...emptyTraveller("adult", s.nationality), ...pickSavedData(s) });
    } catch {
      setMsg({ tone: "error", text: t.travellers.saved.loadError });
    } finally {
      setBusy(null);
    }
  }

  async function remove(x: SavedTravellerSummary) {
    if (!window.confirm(fmt(a.confirmDelete, { name: x.nameEn }))) return;
    setBusy(x.id);
    try {
      await deleteSavedTraveller(x.id);
      await reload();
      setMsg({ tone: "success", text: a.deleted });
      if (editing?.id === x.id) setEditing(null);
    } catch {
      setMsg({ tone: "error", text: a.errors.generic });
    } finally {
      setBusy(null);
    }
  }

  const clientErrors = editing ? validateSavedTraveller(pickSavedData(editing.tr), today) : {};
  const errors = { ...serverErrors, ...clientErrors };

  async function save() {
    if (!editing) return;
    setShowErrors(true);
    if (Object.keys(clientErrors).length) {
      setMsg({ tone: "error", text: a.errors.invalidTraveller });
      return;
    }
    setBusy("save");
    try {
      await saveTraveller(pickSavedData(editing.tr), editing.id);
      await reload();
      setEditing(null);
      setMsg({ tone: "success", text: a.savedOk });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const e = err as SaveTravellerError;
      setServerErrors(e.fieldErrors ?? {});
      setMsg({ tone: "error", text: (a.errors as Record<string, string>)[e.code] ?? a.errors.generic });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{a.title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{a.intro}</p>
        </div>
        {!editing && (
          <Button onClick={() => open(null, emptyTraveller("adult", defaultNationality))}>
            <UserIcon className="size-5" />
            {a.add}
          </Button>
        )}
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {editing ? (
        <div className="space-y-4">
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-bold">{editing.id ? a.editTitle : a.newTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{a.requiredNote}</p>
            <p className="mt-2 flex items-center gap-2 text-xs text-slate-500"><ShieldIcon className="size-4 shrink-0" />{a.privacy}</p>
          </Card>
          <TravellerForm
            mode="profile"
            index={0}
            traveller={editing.tr}
            all={[editing.tr]}
            errors={errors}
            showErrors={showErrors}
            onChange={(patch) => setEditing((cur) => (cur ? { ...cur, tr: { ...cur.tr, ...patch } } : cur))}
          />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => { setEditing(null); setMsg(null); }}>{t.common.cancel}</Button>
            <Button onClick={() => void save()} loading={busy === "save"}>{t.common.save}</Button>
          </div>
        </div>
      ) : loading ? (
        <div className="grid place-items-center py-16"><Spinner className="size-8 text-brand-700" /></div>
      ) : list.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">{a.empty}</Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((x) => {
            const status = passportStatus(x.passportExpiryDate, today);
            return (
              <li key={x.id}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold" dir="ltr">{x.nameEn}</p>
                      {x.nameAr && <p className="truncate text-sm text-slate-600" dir="rtl">{x.nameAr}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[status]}>{a.status[status]}</Badge>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                    <PassportIcon className="size-4 text-brand-700" />
                    <span>{a.passport} <bdi className="ltr-nums font-semibold text-ink">{x.passportNoMasked}</bdi></span>
                    <span aria-hidden className="text-slate-300">•</span>
                    <span>{countryName(x.nationality, locale)}</span>
                    {x.passportExpiryDate && (
                      <>
                        <span aria-hidden className="text-slate-300">•</span>
                        <span>{fmt(t.travellers.saved.expires, { date: "" })}<bdi className="ltr-nums">{x.passportExpiryDate}</bdi></span>
                      </>
                    )}
                  </p>
                  <div className="mt-auto flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void edit(x)} loading={busy === x.id}>{t.common.edit}</Button>
                    <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => void remove(x)} disabled={busy === x.id}>{a.delete}</Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
