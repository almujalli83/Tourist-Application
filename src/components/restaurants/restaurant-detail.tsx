"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/i18n";
import { formatExpiryInput, parseExpiry } from "@/lib/card-expiry";
import { SAUDI_CITIES } from "@/lib/data/cities";
import { fmtDay, ksaDay } from "@/lib/events/format";
import { directionsLinks } from "@/lib/guide/geo";
import { isOpenNow } from "@/lib/guide/hours";
import type { Restaurant } from "@/lib/restaurants/catalog";
import { useApp } from "../app-provider";
import { BackLink } from "../back-link";
import { ClockIcon, DirectionsIcon, LockIcon, MapPinIcon } from "../icons";
import { Alert, Badge, Button, Card, Field, Input, Spinner } from "../ui";
import { priceSigns, SlotPicker, Stars } from "./shared";

const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** Restaurant page: details, policy and table booking. */
export function RestaurantDetail({ id }: { id: string }) {
  const { t, locale, money, user } = useApp();
  const rs = t.restaurants;
  const d = rs.details;
  const g = t.guide;
  const ar = locale === "ar";
  const router = useRouter();
  const [r, setR] = useState<Restaurant | null>(null);
  const [missing, setMissing] = useState(false);
  const [day, setDay] = useState(() => ksaDay(new Date()));
  const [party, setParty] = useState(2);
  const [time, setTime] = useState<string | null>(null);
  const [card, setCard] = useState({ holder: "", number: "", exp: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => {
    fetch(`/api/restaurants/${encodeURIComponent(id)}`)
      .then((x) => (x.ok ? x.json() : Promise.reject()))
      .then((x) => {
        setR(x.restaurant);
        // Day and party size can come from a link (e.g. a trip plan): ?date=YYYY-MM-DD&party=N.
        const qs = new URLSearchParams(window.location.search);
        const wantDay = qs.get("date");
        const wantParty = Number(qs.get("party"));
        if (wantDay && /^\d{4}-\d{2}-\d{2}$/.test(wantDay) && wantDay >= ksaDay(new Date())) setDay(wantDay);
        if (Number.isInteger(wantParty) && wantParty >= 1) setParty(Math.min(wantParty, x.restaurant.maxParty));
      })
      .catch(() => setMissing(true));
  }, [id]);
  useEffect(() => {
    key.current = newKey();
    setErr(null);
  }, [day, party, time]);

  if (missing) return <Alert tone="error">{rs.errors.generic}</Alert>;
  if (!r) return <div className="grid min-h-[40vh] place-items-center text-brand-700"><Spinner className="size-8" /></div>;

  const fee = Math.round(r.policy.feePerGuestSAR * party * 100) / 100;
  const city = SAUDI_CITIES.find((c) => c.code === r.city);
  const open = isOpenNow(r, new Date());
  const links = directionsLinks(r);

  async function book(e: React.FormEvent) {
    e.preventDefault();
    if (!time) {
      setErr(d.chooseTime);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { expMonth, expYear } = parseExpiry(card.exp);
      const res = await fetch("/api/restaurants/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurantId: r!.id, day, time, party, expectedFeeSAR: fee, idempotencyKey: key.current,
          card: fee > 0 ? { holder: card.holder, number: card.number.replace(/\s/g, ""), expMonth, expYear, cvc: card.cvc } : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr((rs.errors as Record<string, string>)[body.error] ?? rs.errors.generic);
        key.current = newKey();
        if (body.error === "slotFull") setTime(null);
        return;
      }
      router.push(`/${locale}/account/table-bookings/${body.booking.id}?new=1`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <BackLink href={`/${locale}/restaurants`} label={d.back} />
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-700">{rs.cuisines[r.cuisine]} · {priceSigns(r.priceLevel)} · {g.priceLevels[r.priceLevel]}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{ar ? r.nameAr : r.nameEn}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Stars rating={r.rating} /><span>({fmt(rs.reviews, { n: r.reviews })})</span>
              <span>· {fmt(rs.via, { provider: rs.providers[r.provider] })}</span>
            </div>
          </div>
          {open !== null && <Badge tone={open ? "brand" : "red"}>{open ? g.open : g.closed}</Badge>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="font-bold">{d.about}</h2>
              <p className="mt-2 text-sm leading-7 text-slate-700">{ar ? r.descriptionAr : r.descriptionEn}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="flex items-center gap-1.5 font-semibold"><MapPinIcon className="size-4 text-slate-400" />{d.address}</dt>
                <dd className="mt-1 text-slate-700">{ar ? r.addressAr : r.addressEn}{city && ` · ${ar ? city.ar : city.en}`}</dd>
                <dd className="mt-1 flex gap-3 text-xs">
                  <a href={links.google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"><DirectionsIcon className="size-3.5" />{g.googleMaps}</a>
                  <Link href={`/${locale}/guide?city=${r.city}&place=${encodeURIComponent(`restaurant:${r.id}`)}`} className="font-semibold text-brand-700 hover:underline">{rs.showOnMap}</Link>
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 font-semibold"><ClockIcon className="size-4 text-slate-400" />{d.hours}</dt>
                {r.hours.map((h, i) => (
                  <dd key={i} className="mt-1 text-slate-700">{h.days.length === 7 ? g.everyDay : h.days.map((x) => g.days[x]).join(ar ? "، " : ", ")} · <span dir="ltr">{h.open} – {h.close}</span></dd>
                ))}
              </div>
            </dl>
            <div>
              <h3 className="text-sm font-semibold">{d.policy}</h3>
              <ul className="mt-1 space-y-1 text-sm text-slate-600">
                <li>{r.policy.feePerGuestSAR ? fmt(rs.feeBooking, { fee: money(r.policy.feePerGuestSAR) }) : rs.freeBooking}</li>
                <li>{fmt(d.cancelUntil, { h: r.policy.cancelCutoffHours })}</li>
                <li>{fmt(d.changeUntil, { h: r.policy.changeCutoffHours })}</li>
              </ul>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-bold">{d.book}</h2>
            <SlotPicker restaurant={r} day={day} party={party} time={time} onDay={setDay} onParty={setParty} onTime={setTime} autoAdvance />
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="font-bold">{d.summary}</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{d.date}</dt><dd className="font-semibold">{fmtDay(day, locale, { weekday: "long", day: "numeric", month: "long" })}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{d.time}</dt><dd className="ltr-nums font-semibold" data-testid="summary-time">{time ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{d.party}</dt><dd className="font-semibold">{party}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-bold"><dt>{d.fee}</dt><dd className="text-brand-800" data-testid="summary-fee">{fee ? money(fee) : rs.freeBooking}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">{fee ? d.feeNote : d.freeNote}</p>
            {err && <Alert tone="error" className="mt-3">{err}</Alert>}
            {!user ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">{d.loginToBook}</p>
                <Link href={`/${locale}/login?next=${encodeURIComponent(`/${locale}/restaurants/${r.id}`)}`} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand-700 text-sm font-semibold text-white hover:bg-brand-800">{d.login}</Link>
              </div>
            ) : (
              <form onSubmit={book} className="mt-4 space-y-3">
                {fee > 0 && (
                  <>
                    <Field label={t.review.cardHolder} required><Input dir="ltr" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} required /></Field>
                    <Field label={t.review.cardNumber} required>
                      <Input dir="ltr" inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} required />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t.review.expiry} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.exp} onChange={(e) => setCard({ ...card, exp: formatExpiryInput(e.target.value).slice(0, 7) })} required /></Field>
                      <Field label={t.review.cvc} required><Input dir="ltr" inputMode="numeric" autoComplete="cc-csc" type="password" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} required /></Field>
                    </div>
                    <p className="text-xs text-slate-500">{t.review.testCards}</p>
                  </>
                )}
                <Button type="submit" variant="gold" size="lg" className="w-full" loading={busy}>
                  {fee > 0 && <LockIcon className="size-5" />}
                  {busy ? d.processing : fee > 0 ? fmt(d.pay, { amount: money(fee) }) : d.confirm}
                </Button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
