"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { HotelOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { HotelIcon, MapPinIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Select, Spinner, Stars } from "../ui";
import { useBooking, type HotelStayResult } from "./booking-context";
import { useFetchStep } from "./use-fetch-step";
import { WizardShell } from "./wizard-shell";

const GRADIENTS = ["from-brand-700 to-brand-500", "from-gold-600 to-gold-500", "from-slate-700 to-slate-500", "from-brand-900 to-brand-600"];

function HotelCard({ offer, selected, onSelect, idx }: { offer: HotelOffer; selected: boolean; onSelect: () => void; idx: number }) {
  const { t, locale, money } = useApp();
  return (
    <Card className={cx("flex flex-col overflow-hidden sm:flex-row", selected && "border-brand-600 ring-2 ring-brand-600/60")}>
      <div className={cx("relative flex h-28 shrink-0 items-end bg-gradient-to-br p-3 text-white sm:h-auto sm:w-40", GRADIENTS[idx % GRADIENTS.length])}>
        <HotelIcon className="absolute end-3 top-3 size-8 opacity-40" />
        <div className="rounded-md bg-black/25 px-2 py-1 text-xs font-bold">{offer.reviewScore.toFixed(1)} / 10</div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">{locale === "ar" ? offer.nameAr : offer.nameEn}</h3>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <Stars n={offer.stars} />
              <span className="inline-flex items-center gap-1"><MapPinIcon className="size-3.5" />{locale === "ar" ? offer.districtAr : offer.districtEn}</span>
            </div>
          </div>
          <Badge tone="gold">{t.common.agent}: {locale === "ar" ? offer.agentNameAr : offer.agentNameEn}</Badge>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          {locale === "ar" ? offer.roomTypeAr : offer.roomTypeEn} · {fmt(t.hotels.rooms, { n: offer.rooms })} · {t.hotels.board[offer.board]}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {offer.amenities.slice(0, 5).map((a) => <Badge key={a}>{t.hotels.amenities[a as keyof typeof t.hotels.amenities] ?? a}</Badge>)}
          <Badge tone={offer.refundable ? "brand" : "slate"}>{offer.refundable ? t.common.refundable : t.common.nonRefundable}</Badge>
        </div>
        <p className="ltr-nums mt-2 text-[11px] text-slate-400">{t.hotels.license} {offer.licenseNo}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
          <div>
            <p className="ltr-nums text-lg font-bold text-brand-800">{money(offer.totalSAR)}</p>
            <p className="text-[11px] text-slate-500"><span className="ltr-nums">{money(offer.pricePerNightSAR)}</span> {t.hotels.perNight} · {offer.nights} {t.common.nights}</p>
          </div>
          <Button size="sm" variant={selected ? "primary" : "secondary"} onClick={onSelect} aria-pressed={selected}>
            {selected ? t.common.selected : t.hotels.selectHotel}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StaySection({ result }: { result: HotelStayResult }) {
  const { t, locale } = useApp();
  const { hotels, selectHotel } = useBooking();
  const [sort, setSort] = useState<"price" | "rating">("price");
  const [agent, setAgent] = useState("");
  const agents = useMemo(() => [...new Map(result.offers.map((o) => [o.agentId, o])).values()], [result.offers]);
  const offers = useMemo(() => {
    const list = result.offers.filter((o) => !agent || o.agentId === agent);
    return [...list].sort((a, b) => (sort === "price" ? a.totalSAR - b.totalSAR : b.reviewScore - a.reviewScore));
  }, [result.offers, sort, agent]);
  const { stay } = result;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-900 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <MapPinIcon className="size-5 text-gold-500" />
          <div>
            <p className="text-sm font-bold">{cityName(stay.city, locale)}</p>
            <p className="ltr-nums text-xs text-brand-100">{stay.checkIn} → {stay.checkOut} · {stay.nights} {t.common.nights}</p>
          </div>
        </div>
        {hotels[stay.city] && <Badge tone="gold">{t.common.selected}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 w-auto" aria-label={t.common.sortBy}>
          <option value="price">{t.common.cheapest}</option>
          <option value="rating">{t.common.rating}</option>
        </Select>
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-9 w-auto" aria-label={t.common.filterAgent}>
          <option value="">{t.common.allAgents}</option>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{locale === "ar" ? a.agentNameAr : a.agentNameEn}</option>)}
        </Select>
      </div>
      {result.failedAgents.length > 0 && <Alert tone="warning">{fmt(t.flights.failedAgents, { agents: result.failedAgents.join(", ") })}</Alert>}
      {offers.length === 0 && <p className="text-sm text-slate-500">{t.common.noResults}</p>}
      <div className="grid gap-3">
        {offers.map((o, i) => <HotelCard key={o.id} idx={i} offer={o} selected={hotels[stay.city] === o.id} onSelect={() => selectHotel(stay.city, o.id)} />)}
      </div>
    </section>
  );
}

export function HotelsStep() {
  const { t, locale } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const flightsDone = !!booking.flightResults && booking.flightResults.every((r) => booking.flights[r.leg.index]);
  const { loading, error, retry } = useFetchStep<{ stays: HotelStayResult[] }>(
    booking.hydrated && !!booking.criteria && !booking.hotelResults,
    "/api/search/hotels",
    booking.criteria,
    (d) => booking.setHotelResults(d.stays),
  );
  const complete = flightsDone && !!booking.hotelResults && booking.hotelResults.every((r) => booking.hotels[r.stay.city]);
  const next = (
    <Button className="w-full" disabled={!complete} onClick={() => router.push(`/${locale}/package-visa/activities`)}>{t.common.continue}</Button>
  );
  return (
    <WizardShell step={2} title={t.hotels.title} subtitle={t.hotels.subtitle} sidebarFooter={next}>
      {!flightsDone && booking.hydrated && <Alert tone="warning" className="mb-4">{t.flights.missing}</Alert>}
      {loading && <div className="flex items-center gap-3 rounded-xl bg-white p-6 text-brand-700"><Spinner className="size-6" />{t.flights.searching}</div>}
      {error && <Alert tone="error">{t.review.errors.generic} <button className="font-semibold underline" onClick={retry}>{t.common.retry}</button></Alert>}
      <div className="space-y-8">
        {booking.hotelResults?.map((r) => <StaySection key={r.stay.city} result={r} />)}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between lg:hidden">
        <Button variant="secondary" onClick={() => router.push(`/${locale}/package-visa/flights`)}>{t.common.back}</Button>
        {next}
      </div>
      {!complete && booking.hotelResults && <p className="mt-3 text-sm text-slate-500">{t.hotels.missing}</p>}
    </WizardShell>
  );
}
