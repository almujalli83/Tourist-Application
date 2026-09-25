"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { countryName } from "@/lib/data/countries";
import { todayISO } from "@/lib/dates";
import type { PublicWalletDoc, WalletDocType, WalletPerson } from "@/lib/wallet";
import { useApp } from "./app-provider";
import { BackLink } from "./back-link";
import { EventTicketsSection } from "./events/ticket-view";
import { PassportIcon, ShieldIcon, TicketIcon, UserIcon } from "./icons";
import { Alert, Badge, Button, Card, cx, Field, Input, SectionTitle, Select, Spinner } from "./ui";

type Person = WalletPerson & { documents: PublicWalletDoc[] };
const UPLOAD_TYPES: WalletDocType[] = ["passport", "photo", "nationalId", "residence", "visa", "insurance", "other"];
const IDENTITY: WalletDocType[] = ["passport", "photo", "nationalId", "residence"];

/** Same thresholds as the server (expired / within 30 days / valid). */
function expiryState(expiry: string | undefined, today: string) {
  if (!expiry) return "none" as const;
  if (expiry < today) return "expired" as const;
  const soon = new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10);
  return expiry <= soon ? ("expiring" as const) : ("valid" as const);
}
const STATE_TONE = { valid: "brand", expiring: "amber", expired: "red", none: "slate" } as const;

/** Service 3 — digital wallet of the account's travellers. */
export function WalletView() {
  const { t, locale } = useApp();
  const w = t.wallet;
  const today = todayISO();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (!res.ok) {
      setError(true);
      return;
    }
    const data = (await res.json()) as { people: Person[] };
    setPeople(data.people);
    setSelected((cur) => (cur && data.people.some((p) => p.key === cur) ? cur : data.people[0]?.key ?? null));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const needsAttention = (p: Person) =>
    [p.passportExpiryDate ?? undefined, ...p.documents.map((d) => d.meta.expiryDate)].some((e) => ["expired", "expiring"].includes(expiryState(e, today)));

  if (error) return <Alert tone="error">{t.review.errors.generic}</Alert>;
  if (!people) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;
  const person = people.find((p) => p.key === selected) ?? null;

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/account`} label={t.account.title} className="-ms-2.5" />
      <div>
        <h1 className="text-2xl font-bold">{w.title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{w.subtitle}</p>
      </div>

      {people.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          {w.empty}{" "}
          <Link href={`/${locale}/account/travellers`} className="font-semibold text-brand-700 underline">{t.account.travellers.title}</Link>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <Card className="h-fit overflow-hidden">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold">{w.travellers}</p>
            <ul className="divide-y divide-slate-100">
              {people.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(p.key)}
                    aria-pressed={selected === p.key}
                    className={cx("flex w-full items-center justify-between gap-2 px-4 py-3 text-start hover:bg-slate-50", selected === p.key && "bg-brand-50")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold" dir="ltr">{p.nameEn}</span>
                      <span className="ltr-nums block text-xs text-slate-500">{countryName(p.nationality, locale)} · {p.passportNoMasked}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <Badge>{fmt(w.docsCount, { n: p.documents.length + Number(p.hasSavedPassportImage) + Number(p.hasSavedPhoto) })}</Badge>
                      {needsAttention(p) && <Badge tone="amber">{w.attention}</Badge>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {person && <PersonWallet key={person.key} person={person} today={today} onChange={load} />}
        </div>
      )}

      <EventTicketsSection />
    </div>
  );
}

function PersonWallet({ person, today, onChange }: { person: Person; today: string; onChange: () => Promise<void> }) {
  const { t, locale } = useApp();
  const w = t.wallet;
  const active = person.documents.filter((d) => expiryState(d.meta.expiryDate, today) !== "expired");
  const expired = person.documents.filter((d) => expiryState(d.meta.expiryDate, today) === "expired");
  const identity = active.filter((d) => IDENTITY.includes(d.type));
  const visa = active.filter((d) => d.type === "visa" || d.type === "insurance");
  const other = active.filter((d) => d.type === "other");
  const savedTiles = [
    person.hasSavedPassportImage && { kind: "passportImage", label: w.types.passport },
    person.hasSavedPhoto && { kind: "personPhoto", label: w.types.photo },
  ].filter(Boolean) as { kind: string; label: string }[];

  return (
    <div className="min-w-0 space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-lg font-bold" dir="ltr">{person.nameEn}</p>
          <p className="ltr-nums text-sm text-slate-500">{countryName(person.nationality, locale)} · {w.passport} {person.passportNoMasked}</p>
        </div>
        {person.passportExpiryDate && <ExpiryBadge expiry={person.passportExpiryDate} today={today} label={`${w.passport}: ${person.passportExpiryDate}`} />}
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title={w.sections.identity} icon={<PassportIcon className="size-5" />} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {savedTiles.map((s) => (
            <div key={s.kind} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
              <div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-slate-500">{w.fromSaved}</p>
              </div>
              <a className="text-sm font-semibold text-brand-700 hover:underline" href={`/api/wallet/saved/${person.savedTravellerId}/${s.kind}`} target="_blank" rel="noopener">{w.view}</a>
            </div>
          ))}
          {identity.map((d) => <DocCard key={d.id} doc={d} today={today} onChange={onChange} />)}
        </div>
        {!savedTiles.length && !identity.length && <p className="mt-3 text-sm text-slate-500">—</p>}
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle title={w.sections.visa} icon={<ShieldIcon className="size-5" />} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {visa.map((d) => <DocCard key={d.id} doc={d} today={today} onChange={onChange} />)}
        </div>
        {!visa.length && <p className="mt-3 text-sm text-slate-500">—</p>}
      </Card>

      {person.bookings.length > 0 && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title={w.sections.bookings} icon={<TicketIcon className="size-5" />} />
          <ul className="mt-4 space-y-2">
            {person.bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="font-semibold">{fmt(w.bookingDocs, { ref: b.reference })}</p>
                  <p className="text-xs text-slate-500"><span className="ltr-nums">{b.departureDate} → {b.returnDate}</span> · {w.bookingDocsDesc}</p>
                </div>
                <Link href={`/${locale}/account/wallet/bookings/${b.id}?person=${encodeURIComponent(person.key)}`} className="text-sm font-semibold text-brand-700 hover:underline">{w.openDocs}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {other.length > 0 && (
        <Card className="p-5 sm:p-6">
          <SectionTitle title={w.sections.other} icon={<UserIcon className="size-5" />} />
          <div className="mt-4 grid gap-3 md:grid-cols-2">{other.map((d) => <DocCard key={d.id} doc={d} today={today} onChange={onChange} />)}</div>
        </Card>
      )}

      <UploadForm personKey={person.key} onDone={onChange} />

      {expired.length > 0 && (
        <details className="rounded-2xl border border-slate-200 bg-white p-5">
          <summary className="cursor-pointer font-bold">{w.sections.expired} ({expired.length})</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{expired.map((d) => <DocCard key={d.id} doc={d} today={today} onChange={onChange} />)}</div>
        </details>
      )}
    </div>
  );
}

function ExpiryBadge({ expiry, today, label }: { expiry?: string; today: string; label?: string }) {
  const { t } = useApp();
  const state = expiryState(expiry, today);
  if (state === "none") return null;
  return <Badge tone={STATE_TONE[state]}>{label ? `${t.wallet.state[state]} · ${label}` : t.wallet.state[state]}</Badge>;
}

function DocCard({ doc, today, onChange }: { doc: PublicWalletDoc; today: string; onChange: () => Promise<void> }) {
  const { t } = useApp();
  const w = t.wallet;
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(w.confirmDelete)) return;
    setBusy(true);
    await fetch(`/api/wallet/documents/${doc.id}`, { method: "DELETE" });
    await onChange();
    setBusy(false);
  }
  const rows = [
    doc.meta.number && [w.number, doc.meta.number],
    doc.meta.issueDate && [w.issueDate, doc.meta.issueDate],
    doc.meta.expiryDate && [w.expiryDate, doc.meta.expiryDate],
    doc.meta.status && [w.status, (t.confirmation.statuses as Record<string, string>)[doc.meta.status] ?? doc.meta.status],
  ].filter(Boolean) as [string, string][];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{w.types[doc.type]}</p>
          {doc.title && <p className="truncate text-xs text-slate-500">{doc.title}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={doc.source === "central" ? "brand" : "slate"}>{w.source[doc.source]}</Badge>
          <ExpiryBadge expiry={doc.meta.expiryDate} today={today} />
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className="ltr-nums font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!doc.hasFile && <p className="text-xs text-amber-700">{w.noFile}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {doc.hasFile && (
          <>
            <a href={`/api/wallet/documents/${doc.id}/file`} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">{w.view}</a>
            <a href={`/api/wallet/documents/${doc.id}/file?download=1`} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50">{w.download}</a>
          </>
        )}
        <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" onClick={() => void remove()} loading={busy}>{w.delete}</Button>
      </div>
    </div>
  );
}

function UploadForm({ personKey, onDone }: { personKey: string; onDone: () => Promise<void> }) {
  const { t } = useApp();
  const u = t.wallet.upload;
  const [type, setType] = useState<WalletDocType>("nationalId");
  const [title, setTitle] = useState("");
  const [number, setNumber] = useState("");
  const [expiryDate, setExpiry] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [inputKey, setInputKey] = useState(0); // bumped to reset the file input after an upload

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const form = new FormData();
    form.set("file", file);
    form.set("personKey", personKey);
    form.set("type", type);
    form.set("title", title);
    form.set("number", number);
    form.set("expiryDate", expiryDate);
    try {
      const res = await fetch("/api/wallet/documents", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? (res.status === 413 ? "tooLarge" : "generic"));
      setMsg({ tone: "success", text: u.done });
      setTitle("");
      setNumber("");
      setExpiry("");
      setFile(null);
      setInputKey((k) => k + 1);
      await onDone();
    } catch (err) {
      setMsg({ tone: "error", text: (u.errors as Record<string, string>)[(err as Error).message] ?? u.errors.generic });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="p-5 sm:p-6">
        <SectionTitle title={u.title} icon={<PassportIcon className="size-5" />} subtitle={u.hint} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={u.type} required htmlFor="wallet-type">
            <Select id="wallet-type" value={type} onChange={(e) => setType(e.target.value as WalletDocType)}>
              {UPLOAD_TYPES.map((x) => <option key={x} value={x}>{t.wallet.types[x]}</option>)}
            </Select>
          </Field>
          <Field label={u.label} htmlFor="wallet-title">
            <Input id="wallet-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t.wallet.number} htmlFor="wallet-number">
            <Input id="wallet-number" dir="ltr" value={number} maxLength={40} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label={t.wallet.expiryDate} htmlFor="wallet-expiry">
            <Input id="wallet-expiry" type="date" value={expiryDate} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label={u.file} required htmlFor="wallet-file" className="sm:col-span-2">
            <Input key={inputKey} id="wallet-file" type="file" accept="application/pdf,image/jpeg,image/png" className="h-auto py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
        {msg && <Alert tone={msg.tone} className="mt-4">{msg.text}</Alert>}
        <Button type="submit" className="mt-4" loading={busy} disabled={!file}>{u.submit}</Button>
      </Card>
    </form>
  );
}
