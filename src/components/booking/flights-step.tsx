"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { fmt } from "@/i18n";
import { cityName } from "@/lib/data/cities";
import type { FlightOffer } from "@/lib/types";
import { useApp } from "../app-provider";
import { PlaneIcon } from "../icons";
import { Alert, Badge, Button, Card, cx, Select, Spinner } from "../ui";
import { useBooking, type FlightLegResult } from "./booking-context";
import { useFetchStep } from "./use-fetch-step";
import { WizardShell } from "./wizard-shell";

function time(iso: string) {
  return iso.slice(11, 16);
}

function dur(min: number) {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

function FlightCard({ offer, selected, onSelect }: { offer: FlightOffer; selected: boolean; onSelect: () => void }) {
  const { t, locale, money } = useApp();
  const dayShift = offer.arriveAt.slice(0, 10) !== offer.departAt.slice(0, 10);
  return (
    <Card className={cx("p-4 transition", selected && "border-brand-600 ring-2 ring-brand-600/60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-700">{offer.carrierCode}</span>
          <div>
            <p className="text-sm font-semibold">{locale === "ar" ? offer.carrierNameAr : offer.carrierNameEn}</p>
            <p className="ltr-nums text-xs text-slate-500">{offer.flightNo} · {t.search.cabins[offer.cabin]}</p>
          </div>
        </div>
        <Badge tone="gold">{t.common.agent}: {locale === "ar" ? offer.agentNameAr : offer.agentNameEn}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3">
        <div className="text-center">
          <p className="ltr-nums text-xl font-bold">{time(offer.departAt)}</p>
          <p className="text-xs font-semibold text-slate-500">{offer.from}</p>
        </div>
        <div className="flex flex-col items-center">
          <span className="ltr-nums text-xs text-slate-500">{dur(offer.durationMin)}</span>
          <div className="relative my-1 h-px w-full bg-slate-300">
            <PlaneIcon className="absolute start-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 bg-white text-brand-600 rtl:-scale-x-100" />
          </div>
          <span className={cx("text-xs", offer.stops ? "text-amber-700" : "text-brand-700")}>
            {offer.stops ? fmt(t.flights.stops, { n: offer.stops }) : t.flights.direct}
          </span>
        </div>
        <div className="text-center">
          <p className="ltr-nums text-xl font-bold">{time(offer.arriveAt)}{dayShift && <sup className="text-xs text-amber-700">+1</sup>}</p>
          <p className="text-xs font-semibold text-slate-500">{offer.to}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{fmt(t.flights.baggage, { kg: offer.baggageKg })}</Badge>
          <Badge tone={offer.refundable ? "brand" : "slate"}>{offer.refundable ? t.common.refundable : t.common.nonRefundable}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="ltr-nums text-lg font-bold text-brand-800">{money(offer.totalSAR)}</p>
            <p className="text-[11px] text-slate-500">{t.flights.forAll}</p>
          </div>
          <Button size="sm" variant={selected ? "primary" : "secondary"} onClick={onSelect} aria-pressed={selected}>
            {selected ? t.common.selected : t.common.select}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function LegSection({ result }: { result: FlightLegResult }) {
  const { t, locale } = useApp();
  const { flights, selectFlight } = useBooking();
  const [sort, setSort] = useState<"price" | "duration" | "time">("price");
  const [agent, setAgent] = useState("");
  const agents = useMemo(() => [...new Map(result.offers.map((o) => [o.agentId, o])).values()], [result.offers]);
  const offers = useMemo(() => {
    const list = result.offers.filter((o) => !agent || o.agentId === agent);
    const key = { price: (o: FlightOffer) => o.totalSAR, duration: (o: FlightOffer) => o.durationMin, time: (o: FlightOffer) => Date.parse(o.departAt) }[sort];
    return [...list].sort((a, b) => key(a) - key(b));
  }, [result.offers, sort, agent]);
  const { leg } = result;
  const label = leg.kind === "outbound" ? t.flights.legOutbound : leg.kind === "return" ? t.flights.legReturn : t.flights.legDomestic;
  const selected = flights[leg.index];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-900 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-gold-500 text-sm font-bold">{leg.index + 1}</span>
          <div>
            <p className="text-sm font-bold">{label}: {cityName(leg.from, locale)} {locale === "ar" ? "←" : "→"} {cityName(leg.to, locale)}</p>
            <p className="ltr-nums text-xs text-brand-100">{leg.date}</p>
          </div>
        </div>
        {selected && <Badge tone="gold">{t.common.selected}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 w-auto" aria-label={t.common.sortBy}>
          <option value="price">{t.common.cheapest}</option>
          <option value="duration">{t.common.fastest}</option>
          <option value="time">{t.common.earliest}</option>
        </Select>
        <Select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-9 w-auto" aria-label={t.common.filterAgent}>
          <option value="">{t.common.allAgents}</option>
          {agents.map((a) => <option key={a.agentId} value={a.agentId}>{locale === "ar" ? a.agentNameAr : a.agentNameEn}</option>)}
        </Select>
      </div>
      {result.failedAgents.length > 0 && <Alert tone="warning">{fmt(t.flights.failedAgents, { agents: result.failedAgents.join(", ") })}</Alert>}
      {offers.length === 0 && <p className="text-sm text-slate-500">{t.common.noResults}</p>}
      <div className="grid gap-3 xl:grid-cols-2">
        {offers.map((o) => <FlightCard key={o.id} offer={o} selected={selected === o.id} onSelect={() => selectFlight(leg.index, o.id)} />)}
      </div>
    </section>
  );
}

export function FlightsStep() {
  const { t, locale } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const { loading, error, retry } = useFetchStep<{ legs: FlightLegResult[] }>(
    booking.hydrated && !!booking.criteria && !booking.flightResults,
    "/api/search/flights",
    booking.criteria,
    (d) => booking.setFlightResults(d.legs),
  );
  const complete = !!booking.flightResults && booking.flightResults.every((r) => booking.flights[r.leg.index]);

  const next = (
    <Button className="w-full" disabled={!complete} onClick={() => router.push(`/${locale}/package-visa/hotels`)}>
      {t.common.continue}
    </Button>
  );

  return (
    <WizardShell step={1} title={t.flights.title} subtitle={t.flights.subtitle} sidebarFooter={next}>
      {loading && (
        <div className="flex items-center gap-3 rounded-xl bg-white p-6 text-brand-700"><Spinner className="size-6" />{t.flights.searching}</div>
      )}
      {error && (
        <Alert tone="error">
          {t.review.errors.generic} <button className="font-semibold underline" onClick={retry}>{t.common.retry}</button>
        </Alert>
      )}
      <div className="space-y-8">
        {booking.flightResults?.map((r) => <LegSection key={r.leg.index} result={r} />)}
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between lg:hidden">
        <Button variant="secondary" onClick={() => router.push(`/${locale}/package-visa`)}>{t.common.back}</Button>
        {next}
      </div>
      {!complete && booking.flightResults && <p className="mt-3 text-sm text-slate-500">{t.flights.missing}</p>}
    </WizardShell>
  );
}
