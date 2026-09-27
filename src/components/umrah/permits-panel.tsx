"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { fmtDay } from "@/lib/events/format";
import type { NusukSlot, PermitType, RawdahGroup } from "@/lib/umrah/nusuk";
import type { PublicPermit } from "@/lib/umrah/permits";
import type { UmrahTrip } from "@/lib/umrah/trips";
import { useApp } from "../app-provider";
import { KaabaIcon } from "../icons";
import { Alert, Badge, Button, cx, Spinner } from "../ui";

export type PermitView = PublicPermit & { qrSvg?: string };

/** Choose travellers, day and time from Nusuk's availability, then issue the permit. */
function BookPermit({ trip, type, onDone, onClose }: { trip: UmrahTrip; type: PermitType; onDone: () => void; onClose: () => void }) {
  const { t, locale } = useApp();
  const s = t.umrah.permits;
  const has = (no: string) => trip.permits.some((p) => p.type === type && p.travellers.some((x) => x.applicationNo === no));
  const eligible = trip.travellers.filter((x) => x.visa && !has(x.applicationNo));
  const [people, setPeople] = useState<string[]>(eligible.map((x) => x.applicationNo));
  const [group, setGroup] = useState<RawdahGroup | "">("");
  const [date, setDate] = useState(trip.windows[type][0] ?? "");
  const [slots, setSlots] = useState<NusukSlot[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errorText = (code: string) => (s.errors as Record<string, string>)[code] ?? s.errors.generic;

  const ready = !!date && people.length > 0 && (type === "umrah" || !!group);
  useEffect(() => {
    setSlot(null);
    setSlots(null);
    setErr(null);
    if (!ready) return;
    const q = new URLSearchParams({ trip: trip.key!, type, date, people: String(people.length), ...(group ? { group } : {}) });
    let live = true;
    fetch(`/api/umrah/slots?${q}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (!r.ok) {
          setErr(errorText(d.error));
          setSlots([]);
        } else setSlots(d.slots);
      })
      .catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, people.length, group, ready]);

  async function issue() {
    if (!slot) return;
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/umrah/permits", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripKey: trip.key, type, date, slotId: slot, applicationNos: people, ...(group ? { group } : {}) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(errorText(d.error));
    onDone();
  }

  const open = (slots ?? []).filter((x) => x.remaining >= people.length);
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200" data-testid={`book-${type}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{type === "umrah" ? s.bookUmrah : s.bookRawdah}</p>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:underline">{s.close}</button>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">{s.travellers}</p>
        <div className="flex flex-wrap gap-2">
          {trip.travellers.map((x) => {
            const disabled = !x.visa || has(x.applicationNo);
            return (
              <label key={x.applicationNo} className={cx("flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200", disabled && "opacity-50")}>
                <input type="checkbox" disabled={disabled} checked={people.includes(x.applicationNo)} className="accent-brand-700" data-testid="permit-traveller"
                  onChange={(e) => setPeople((cur) => (e.target.checked ? [...cur, x.applicationNo] : cur.filter((y) => y !== x.applicationNo)))} />
                <span dir="ltr">{x.name}</span>
              </label>
            );
          })}
        </div>
      </div>
      {type === "rawdah" && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">{s.group}</p>
          <div className="flex gap-2">
            {(["men", "women"] as const).map((g) => (
              <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} data-testid={`permit-group-${g}`}
                className={cx("h-9 rounded-full px-4 text-sm font-semibold", group === g ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>{s.groups[g]}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-600">{s.day}</p>
        <div className="flex flex-wrap gap-2">
          {trip.windows[type].map((d) => (
            <button key={d} type="button" aria-pressed={date === d} onClick={() => setDate(d)} data-testid="permit-day"
              className={cx("h-9 rounded-full px-3 text-sm font-semibold", date === d ? "bg-brand-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200")}>
              {fmtDay(d, locale, { weekday: "short", day: "numeric", month: "short" })}{type === "umrah" && d === trip.umrahDate ? " ★" : ""}
            </button>
          ))}
        </div>
      </div>
      {ready && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">{s.time}</p>
          {!slots ? (
            <div className="grid h-12 place-items-center text-brand-700"><Spinner className="size-5" /></div>
          ) : open.length === 0 ? (
            <p className="text-sm text-slate-500" data-testid="permit-no-slots">{s.noSlots}</p>
          ) : null}
          {slots && slots.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((x) => {
                const full = x.remaining < people.length;
                return (
                  <button key={x.id} type="button" disabled={full} aria-pressed={slot === x.id} onClick={() => setSlot(x.id)} data-testid="permit-slot"
                    className={cx("rounded-xl px-3 py-2 text-start text-sm ring-1", slot === x.id ? "bg-brand-800 text-white ring-brand-800" : full ? "cursor-not-allowed bg-slate-100 text-slate-500 ring-slate-200" : "bg-white ring-slate-200 hover:ring-brand-600")}>
                    <span className="ltr-nums block font-bold" dir="ltr">{x.start} – {x.end}</span>
                    <span className="block text-xs">{full ? s.full : fmt(s.remaining, { n: x.remaining })}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-slate-500">{s.consent}</p>
      {err && <Alert tone="error"><span data-testid="permit-error">{err}</span></Alert>}
      <Button disabled={!slot || !people.length} loading={busy} onClick={issue} data-testid="permit-issue">{s.issue}</Button>
    </div>
  );
}

function PermitRow({ p, onChange }: { p: PermitView; onChange: () => void }) {
  const { t, locale } = useApp();
  const s = t.umrah.permits;
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!confirm(s.cancelConfirm)) return;
    setBusy(true);
    await fetch(`/api/umrah/permits/${p.id}`, { method: "DELETE" });
    setBusy(false);
    onChange();
  }
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-slate-200" data-testid="permit">
      {p.qrSvg && <div className="size-24 shrink-0 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: p.qrSvg }} />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex flex-wrap items-center gap-2 font-bold">
          <KaabaIcon className="size-4 text-brand-700" />{s.type[p.type]}{p.group ? ` · ${s.groups[p.group]}` : ""}
          {p.source === "sandbox" && <Badge tone="gold">{t.umrah.sample}</Badge>}
        </p>
        <p className="mt-0.5">{fmtDay(p.date, locale, { weekday: "long", day: "numeric", month: "long" })} · <span className="ltr-nums" dir="ltr">{p.start} – {p.end}</span></p>
        <p className="text-xs text-slate-500">{s.permitNo}: <span className="ltr-nums" dir="ltr" data-testid="permit-no">{p.permitNo}</span></p>
        <p className="text-xs text-slate-500" dir="ltr">{p.travellers.map((x) => x.nameEn).join(", ")}</p>
      </div>
      <Button size="sm" variant="secondary" loading={busy} onClick={cancel} data-testid="permit-cancel">{s.cancel}</Button>
    </li>
  );
}

/** Nusuk permits of a trip: the ones issued, and booking new ones (or the Nusuk links when not linked). */
export function PermitsPanel({ trip, nusuk, links, onChange }: { trip: UmrahTrip & { permits: PermitView[] }; nusuk: "api" | "sandbox" | null; links: React.ReactNode; onChange: () => void }) {
  const { t } = useApp();
  const s = t.umrah.permits;
  const [open, setOpen] = useState<PermitType | null>(null);
  if (!trip.key) return <p className="text-sm text-slate-600">{s.draft}</p>;
  if (!nusuk) return <div className="space-y-2"><p className="text-sm text-slate-600">{s.manual}</p>{links}</div>;
  const anyVisa = trip.travellers.some((x) => x.visa);
  const canBook = (type: PermitType) => trip.windows[type].length > 0 && trip.travellers.some((x) => x.visa && !trip.permits.some((p) => p.type === type && p.travellers.some((y) => y.applicationNo === x.applicationNo)));
  return (
    <div className="space-y-3" data-testid="permits-panel">
      <p className="font-bold">{s.title}</p>
      <p className="text-xs text-slate-500">{s.intro}</p>
      {nusuk === "sandbox" && <p className="text-xs font-semibold text-amber-700">{s.sandbox}</p>}
      {trip.permits.length > 0 ? (
        <ul className="space-y-2">{trip.permits.map((p) => <PermitRow key={p.id} p={p} onChange={onChange} />)}</ul>
      ) : (
        <p className="text-sm text-slate-500">{s.none}</p>
      )}
      {!anyVisa ? (
        <p className="text-sm text-slate-600">{s.noVisa}</p>
      ) : open ? (
        <BookPermit trip={trip} type={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); onChange(); }} />
      ) : (
        <div className="flex flex-wrap gap-2">
          {canBook("umrah") && <Button onClick={() => setOpen("umrah")} data-testid="book-umrah-btn"><KaabaIcon className="size-4" />{s.bookUmrah}</Button>}
          {canBook("rawdah") && <Button variant="secondary" onClick={() => setOpen("rawdah")} data-testid="book-rawdah-btn">{s.bookRawdah}</Button>}
        </div>
      )}
    </div>
  );
}
