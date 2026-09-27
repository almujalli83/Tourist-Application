"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fmt } from "@/i18n";
import { useApp } from "./app-provider";
import { UsersIcon } from "./icons";
import { Alert, Button, Card, Spinner } from "./ui";

function Inner() {
  const { t, locale, user } = useApp();
  const f = t.family;
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [p, setP] = useState<{ familyName: string; headName: string; email: string; members: number } | null | false>(null);
  const [share, setShare] = useState({ shareTrips: true, shareTravellers: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/family/join?token=${encodeURIComponent(token)}`).then(async (r) => setP(r.ok ? await r.json() : false)).catch(() => setP(false));
  }, [token]);
  if (p === null) return <div className="grid h-24 place-items-center text-brand-700"><Spinner className="size-6" /></div>;
  if (p === false) return <Alert tone="error">{f.errors.expired}</Alert>;
  const here = `/${locale}/family/join?token=${encodeURIComponent(token)}`;
  async function join() {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/family/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...share }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr((f.errors as Record<string, string>)[d.error] ?? f.errors.generic);
    router.push(`/${locale}/account/family`);
  }
  return (
    <div className="space-y-4" data-testid="family-join">
      <p className="text-sm text-slate-700">{fmt(f.joinIntro, { head: p.headName, family: p.familyName, n: p.members })}</p>
      {!user || user.email !== p.email ? (
        <>
          <Alert tone="info">{fmt(f.joinFor, { email: p.email })}</Alert>
          <div className="flex gap-2">
            <Link href={`/${locale}/login?next=${encodeURIComponent(here)}`} className="inline-flex h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">{f.signIn}</Link>
            <Link href={`/${locale}/register?next=${encodeURIComponent(here)}`} className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-brand-800 ring-1 ring-inset ring-brand-700/25 hover:bg-brand-50">{f.register}</Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink">{f.joinChoose}</p>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-brand-700" checked={share.shareTrips} onChange={(e) => setShare({ ...share, shareTrips: e.target.checked })} />{f.shareTrips}</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-brand-700" checked={share.shareTravellers} onChange={(e) => setShare({ ...share, shareTravellers: e.target.checked })} data-testid="join-share-travellers" />{f.shareTravellers}</label>
          {err && <Alert tone="error">{err}</Alert>}
          <Button onClick={() => void join()} loading={busy} data-testid="family-accept">{f.join}</Button>
        </>
      )}
    </div>
  );
}

export function FamilyJoin() {
  const { t } = useApp();
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card className="space-y-4 p-6">
        <h1 className="flex items-center gap-2 text-xl font-bold"><UsersIcon className="size-6 text-brand-700" />{t.family.joinTitle}</h1>
        <Suspense><Inner /></Suspense>
      </Card>
    </div>
  );
}
