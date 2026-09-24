"use client";

import Link from "next/link";
import { useState } from "react";
import { cityName } from "@/lib/data/cities";
import { useApp } from "./app-provider";
import { PhoneInput, phoneHint } from "./phone-input";
import { BackLink } from "./back-link";
import { StatusBadge } from "./booking-details";
import { CountrySelect } from "./booking/country-select";
import { BuildingIcon, UserIcon } from "./icons";
import { Alert, Badge, Button, Card, Field, Input } from "./ui";

export interface BookingRow {
  id: string;
  reference: string;
  clientReference: string | null;
  createdAt: string;
  origin: string;
  cities: string[];
  departureDate: string;
  returnDate: string;
  travellers: number;
  leadName: string;
  visasIssued: number;
  totalSAR: number;
  status: string;
}

function ProfileForm() {
  const { t, user, setUser } = useApp();
  const [ind, setInd] = useState(user?.individual ?? { fullName: "", phone: "", nationality: "" });
  const [co, setCo] = useState(user?.company ?? { companyName: "", commercialRegNo: "", tourismLicenseNo: "", vatNo: "", contactPerson: "", phone: "", city: "" });
  const [msg, setMsg] = useState<"saved" | "error" | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const isCo = user.accountType === "company";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(isCo ? { company: co } : { individual: ind }) });
    setBusy(false);
    if (res.ok) {
      setUser((await res.json()).user);
      setMsg("saved");
    } else setMsg("error");
  }

  const a = t.auth;
  return (
    <form onSubmit={save}>
      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold">
            {isCo ? <BuildingIcon className="size-5 text-brand-700" /> : <UserIcon className="size-5 text-brand-700" />}
            {isCo ? t.account.companyProfile : t.account.profile}
          </h2>
          <Badge tone={isCo ? "gold" : "brand"}>{isCo ? "B2B" : "B2C"}</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-500">{isCo ? t.account.b2bNote : t.account.b2cNote}</p>
        {/* The profile sits in a narrow side panel: one field per row keeps every input readable. */}
        <div className="mt-5 grid gap-4">
          <Field label={a.email}><Input value={user.email} disabled dir="ltr" /></Field>
          {isCo ? (
            <>
              <Field label={a.companyName} required><Input value={co.companyName} onChange={(e) => setCo({ ...co, companyName: e.target.value })} /></Field>
              <Field label={a.commercialRegNo} required><Input dir="ltr" value={co.commercialRegNo} onChange={(e) => setCo({ ...co, commercialRegNo: e.target.value })} /></Field>
              <Field label={a.tourismLicenseNo} required><Input dir="ltr" value={co.tourismLicenseNo} onChange={(e) => setCo({ ...co, tourismLicenseNo: e.target.value })} /></Field>
              <Field label={a.vatNo}><Input dir="ltr" value={co.vatNo} onChange={(e) => setCo({ ...co, vatNo: e.target.value })} /></Field>
              <Field label={a.contactPerson} required><Input value={co.contactPerson} onChange={(e) => setCo({ ...co, contactPerson: e.target.value })} /></Field>
              <Field label={a.phone} required hint={phoneHint(co.phone, "SA", t.travellers.fields.mobileLength)}>
                <PhoneInput value={co.phone} onChange={(v) => setCo({ ...co, phone: v })} />
              </Field>
              <Field label={a.city}><Input value={co.city} onChange={(e) => setCo({ ...co, city: e.target.value })} /></Field>
            </>
          ) : (
            <>
              <Field label={a.fullName} required><Input value={ind.fullName} onChange={(e) => setInd({ ...ind, fullName: e.target.value })} /></Field>
              <Field label={a.phone} required hint={phoneHint(ind.phone, ind.nationality || "SA", t.travellers.fields.mobileLength)}>
                <PhoneInput value={ind.phone} defaultCountry={ind.nationality || "SA"} onChange={(v) => setInd({ ...ind, phone: v })} />
              </Field>
              <Field label={a.nationality}><CountrySelect value={ind.nationality} onChange={(v) => setInd({ ...ind, nationality: v })} /></Field>
            </>
          )}
        </div>
        {msg && <Alert tone={msg === "saved" ? "success" : "error"} className="mt-4">{msg === "saved" ? t.account.saved : a.errors.required}</Alert>}
        <Button type="submit" className="mt-5" loading={busy}>{t.common.save}</Button>
      </Card>
    </form>
  );
}

export function AccountView({ bookings }: { bookings: BookingRow[] }) {
  const { t, locale, money, user } = useApp();
  const isCo = user?.accountType === "company";
  const stats = [
    { label: t.account.stats.total, v: bookings.length },
    { label: t.account.stats.travellers, v: bookings.reduce((a, b) => a + b.travellers, 0) },
    { label: t.account.stats.visas, v: bookings.reduce((a, b) => a + b.visasIssued, 0) },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <BackLink href={`/${locale}`} label={t.nav.home} className="-ms-2.5" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t.account.title}</h1>
        <Link href={`/${locale}/package-visa`} className="inline-flex h-11 items-center rounded-lg bg-gold-500 px-5 text-sm font-semibold text-white hover:bg-gold-600">{t.confirmation.newBooking}</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-3xl font-bold text-brand-800">{s.v}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4 font-bold">{isCo ? t.account.clientBookings : t.account.bookings}</div>
          {bookings.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">{t.account.noBookings}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bookings.map((b) => (
                <li key={b.id}>
                  <Link href={`/${locale}/account/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="ltr-nums font-bold text-brand-800">{b.reference}</span>
                        {b.clientReference && <Badge>{b.clientReference}</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm">{cityName(b.origin, locale)} {locale === "ar" ? "←" : "→"} {b.cities.map((c) => cityName(c, locale)).join(locale === "ar" ? "، " : ", ")}</p>
                      <p className="ltr-nums text-xs text-slate-500">{b.departureDate} → {b.returnDate} · {b.leadName} · {b.travellers} {t.common.travellers}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={b.status} />
                      <span className="ltr-nums font-semibold">{money(b.totalSAR)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ProfileForm />
      </div>
    </div>
  );
}
