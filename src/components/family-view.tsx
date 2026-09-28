"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import { fmtDay } from "@/lib/events/format";
import type { FamilyTrip } from "@/lib/family/family";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { CalendarIcon, CheckIcon, HotelIcon, PlaneIcon, UsersIcon } from "./icons";
import { Alert, Badge, Button, Card, cx, Field, Input, Select, Spinner } from "./ui";

interface MemberView { key: string; name: string; relation: string; status: "invited" | "active"; me: boolean; head: boolean; shareTrips: boolean; shareTravellers: boolean; email: string }
interface FamilyData { id: string; name: string; isHead: boolean; members: MemberView[] }
type Msg = { tone: "success" | "error"; text: string } | null;

const RELATIONS = ["spouse", "son", "daughter", "father", "mother", "brother", "sister", "relative", "friend", "colleague"] as const;

async function call(url: string, method: string, data?: unknown) {
  const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
}

/** Family & group: members, invitations, what each member shares, and the family's trips. */
export function FamilyView() {
  const { t, locale } = useApp();
  const f = t.family;
  const [data, setData] = useState<{ family: FamilyData | null; trips: FamilyTrip[] } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [inv, setInv] = useState({ name: "", email: "", relation: "spouse" });
  const [renaming, setRenaming] = useState(false);
  const errText = (code?: string) => (f.errors as Record<string, string>)[code ?? ""] ?? (t.auth.errors as Record<string, string>)[code ?? ""] ?? f.errors.generic;
  const load = useCallback(() => fetch("/api/family", { cache: "no-store" }).then((r) => r.json()).then(setData), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(url: string, method: string, body?: unknown, success?: string) {
    setBusy(true);
    setMsg(null);
    const { ok, d } = await call(url, method, body);
    setBusy(false);
    if (!ok) {
      setMsg({ tone: "error", text: errText(d.error) });
      return false;
    }
    await load();
    if (success) setMsg({ tone: "success", text: success });
    return true;
  }

  if (!data) return <div className="grid h-40 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  const fam = data.family;
  const me = fam?.members.find((m) => m.me);
  const today = new Date().toISOString().slice(0, 10);
  const day = (d: string) => fmtDay(d, locale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6" data-testid="family-view">
      <BackLink href={`/${locale}/account`} label={t.nav.myBookings} className="-ms-2.5" />
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink"><UsersIcon className="size-7 text-brand-700" />{fam ? fam.name : f.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{f.intro}</p>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {!fam ? (
        <Card className="max-w-xl space-y-3 p-5">
          <h2 className="font-bold text-ink">{f.createTitle}</h2>
          <Field label={f.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={f.namePlaceholder} data-testid="family-name" /></Field>
          <Button onClick={() => void act("/api/family", "POST", { name })} loading={busy} disabled={!name.trim()} data-testid="family-create">{f.create}</Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-ink">{f.members} ({fam.members.length})</h2>
                {fam.isHead && !renaming && <button type="button" onClick={() => { setRenaming(true); setName(fam.name); }} className="text-sm font-semibold text-brand-700 hover:underline">{f.rename}</button>}
              </div>
              {renaming && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={f.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Button size="sm" onClick={async () => { if (await act("/api/family", "PUT", { name })) setRenaming(false); }} loading={busy}>{f.save}</Button>
                </div>
              )}
              <ul className="divide-y divide-slate-100">
                {fam.members.map((m) => (
                  <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="family-member">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                        {m.name}
                        {m.me && <Badge tone="brand">{f.you}</Badge>}
                        <Badge tone={m.head ? "gold" : "slate"}>{(f.relations as Record<string, string>)[m.relation] ?? m.relation}</Badge>
                        {m.status === "invited" && <Badge tone="amber">{f.invited}</Badge>}
                      </p>
                      <p className="text-xs text-slate-500" dir="ltr">{m.email}</p>
                      {m.status === "active" && (
                        <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-slate-600">
                          {m.shareTrips && <span className="inline-flex items-center gap-1"><CheckIcon className="size-3.5 text-brand-700" />{f.sharesTrips}</span>}
                          {m.shareTravellers && <span className="inline-flex items-center gap-1"><CheckIcon className="size-3.5 text-brand-700" />{f.sharesTravellers}</span>}
                        </p>
                      )}
                    </div>
                    {fam.isHead && !m.me && (
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        {m.status === "invited" && (
                          <button type="button" onClick={() => void act("/api/family/invite", "POST", { name: m.name, email: m.email, relation: m.relation, locale }, f.invitedOk)} className="text-brand-700 hover:underline">{f.resend}</button>
                        )}
                        {m.status === "active" && (
                          <button type="button" onClick={() => { if (confirm(f.confirmHead)) void act(`/api/family/members/${m.key}/head`, "POST"); }} className="text-brand-700 hover:underline">{f.makeHead}</button>
                        )}
                        <button type="button" onClick={() => void act(`/api/family/members/${m.key}`, "DELETE")} className="text-red-700 hover:underline" data-testid="family-remove">
                          {m.status === "invited" ? f.cancelInvite : f.remove}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="space-y-4 p-5">
              <h2 className="flex items-center gap-2 font-bold text-ink"><CalendarIcon className="size-5 text-brand-700" />{f.trips}</h2>
              {!data.trips.length && <p className="text-sm text-slate-600">{f.tripsEmpty}</p>}
              <ul className="space-y-3">
                {data.trips.map((tr) => (
                  <li key={`${tr.kind}-${tr.bookingId}`} className={cx("rounded-xl border p-4", tr.returnDate < today ? "border-slate-200 bg-slate-50" : "border-brand-200 bg-white")} data-testid="family-trip" data-kind={tr.kind}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink">
                        {fmt(f.by, { name: tr.mine ? f.you : tr.memberName })} · {tr.kind === "evisa" ? t.evisa.title : tr.cities.map((c) => cityName(c, locale)).join(locale === "ar" ? " ← " : " → ")}
                      </p>
                      <span className="flex flex-wrap gap-1.5">
                        <Badge tone="slate">{t.account.all.kinds[tr.kind]}</Badge>
                        <Badge tone={tr.returnDate < today ? "slate" : "brand"}>{tr.kind === "evisa" ? t.evisa.appStatus[tr.status as keyof typeof t.evisa.appStatus] ?? tr.status : tr.returnDate < today ? f.past : f.upcoming}</Badge>
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {tr.kind === "evisa" ? fmt(t.evisa.arrivalOn, { date: day(tr.departureDate) }) : tr.departureDate === tr.returnDate ? day(tr.departureDate) : `${day(tr.departureDate)} — ${day(tr.returnDate)}`} · {fmt(f.travellers, { n: tr.travellers })}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                      {tr.flights.map((fl) => (
                        <span key={fl.flightNo + fl.departAt} className="inline-flex items-center gap-1"><PlaneIcon className="size-3.5" />{fmt(f.flight, { no: fl.flightNo })} · {fl.from}→{fl.to} · {fl.departAt.replace("T", " ")}</span>
                      ))}
                      {tr.hotels.map((h) => (
                        <span key={h.nameEn + h.checkIn} className="inline-flex items-center gap-1"><HotelIcon className="size-3.5" />{locale === "ar" ? h.nameAr : h.nameEn}</span>
                      ))}
                    </div>
                    {tr.mine && <Link href={`/${locale}${tr.href}`} className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">{f.open}</Link>}
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="space-y-6">
            {fam.isHead && (
              <Card className="space-y-3 p-5">
                <h2 className="font-bold text-ink">{f.inviteTitle}</h2>
                <p className="text-xs text-slate-500">{f.inviteIntro}</p>
                <Field label={f.memberName}><Input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} data-testid="invite-name" /></Field>
                <Field label={f.email}><Input type="email" dir="ltr" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} data-testid="invite-email" /></Field>
                <Field label={f.relation}>
                  <Select value={inv.relation} onChange={(e) => setInv({ ...inv, relation: e.target.value })} data-testid="invite-relation">
                    {RELATIONS.map((r) => <option key={r} value={r}>{f.relations[r]}</option>)}
                  </Select>
                </Field>
                <Button className="w-full" loading={busy} disabled={!inv.name.trim() || !inv.email.trim()} data-testid="invite-send"
                  onClick={async () => { if (await act("/api/family/invite", "POST", { ...inv, locale }, f.invitedOk)) setInv({ name: "", email: "", relation: "spouse" }); }}>
                  {f.invite}
                </Button>
              </Card>
            )}
            {me && (
              <Card className="space-y-3 p-5" data-testid="family-sharing">
                <h2 className="font-bold text-ink">{f.mySharing}</h2>
                {([["shareTrips", f.shareTrips], ["shareTravellers", f.shareTravellers]] as const).map(([k, label]) => (
                  <label key={k} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox" className="mt-1 accent-brand-700" checked={me[k]} data-testid={`share-${k}`}
                      onChange={(e) => {
                        const v = e.target.checked;
                        // Shown at once; the saved state comes back with the reload.
                        setData((d) => (d?.family ? { ...d, family: { ...d.family, members: d.family.members.map((x) => (x.me ? { ...x, [k]: v } : x)) } } : d));
                        void act("/api/family/sharing", "PUT", { [k]: v });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </Card>
            )}
            <Card className="p-5">
              {fam.isHead ? (
                <Button variant="secondary" className="w-full text-red-700" onClick={() => { if (confirm(f.confirmDelete)) void act("/api/family", "DELETE"); }}>{f.delete}</Button>
              ) : (
                <Button variant="secondary" className="w-full text-red-700" onClick={() => { if (confirm(f.confirmLeave)) void act("/api/family/leave", "POST"); }} data-testid="family-leave">{f.leave}</Button>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
