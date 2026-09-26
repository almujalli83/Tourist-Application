"use client";

import Link from "next/link";
import { useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { PhoneInput, phoneHint } from "./phone-input";
import { BackLink } from "./back-link";
import { MyBookings } from "./my-bookings";
import { CountrySelect } from "./booking/country-select";
import { BuildingIcon, PassportIcon, UserIcon, UsersIcon } from "./icons";
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

export function AccountView({ bookings, savedTravellers }: { bookings: BookingRow[]; savedTravellers: number }) {
  const { t, locale } = useApp();
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
        <MyBookings packages={bookings} />
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-bold"><PassportIcon className="size-5 text-brand-700" />{t.wallet.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{t.wallet.subtitle}</p>
            <Link href={`/${locale}/account/wallet`} className="mt-4 inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
              {t.wallet.nav}
            </Link>
          </Card>
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold">
                <UsersIcon className="size-5 text-brand-700" />
                {t.account.travellers.title}
              </h2>
              <Badge tone="brand">{fmt(t.account.travellers.count, { n: savedTravellers })}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{t.account.travellers.intro}</p>
            <Link href={`/${locale}/account/travellers`} className="mt-4 inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">
              {t.account.travellers.manage}
            </Link>
          </Card>
          <ProfileForm />
        </div>
      </div>
    </div>
  );
}
