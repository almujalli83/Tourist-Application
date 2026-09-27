"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PACKAGE_LIMITS } from "@/lib/config";
import { cityName, ORIGIN_CITIES, UMRAH_CITY } from "@/lib/data/cities";
import { addDays, diffDays, isValidISODate, todayISO } from "@/lib/dates";
import { splitNights, validateCriteria, type SearchError } from "@/lib/itinerary";
import { paxFromRooms } from "@/lib/occupancy";
import type { CabinClass, CityStay, RoomOccupancy, SearchCriteria } from "@/lib/types";
import { useApp } from "../app-provider";
import { KaabaIcon, PlaneIcon, UsersIcon } from "../icons";
import { Alert, Button, Card, cx, Field, Input, Select } from "../ui";
import { useBooking } from "./booking-context";
import { CityMultiSelect } from "./city-multi-select";
import { CountrySelect } from "./country-select";
import { GuestsRoomsPicker } from "./guests-rooms-picker";

export function SearchForm() {
  const { t, locale } = useApp();
  const booking = useBooking();
  const router = useRouter();
  const today = todayISO();
  const prev = booking.criteria;

  const [origin, setOrigin] = useState(prev?.origin ?? "");
  const [cities, setCities] = useState<string[]>(prev?.stays.map((s) => s.city).filter((c) => c !== UMRAH_CITY) ?? []);
  const [umrah, setUmrah] = useState(prev?.umrah === true);
  const [umrahHint, setUmrahHint] = useState(false);
  const [departureDate, setDeparture] = useState(prev?.departureDate ?? addDays(today, 14));
  const [returnDate, setReturn] = useState(prev?.returnDate ?? addDays(today, 21));
  const [stays, setStays] = useState<CityStay[]>(prev?.stays ?? []);
  const [rooms, setRooms] = useState<RoomOccupancy[]>(prev?.rooms ?? [{ adults: 2, childAges: [] }]);
  const [cabin, setCabin] = useState<CabinClass>(prev?.cabin ?? "economy");
  const [nationality, setNationality] = useState(prev?.nationality ?? "");
  const [errors, setErrors] = useState<SearchError[]>([]);

  // From the Umrah page (?umrah=1): point at the option (the traveller ticks it and its declaration).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("umrah") === "1") setUmrahHint(true);
  }, []);
  // With Umrah, Makkah follows Jeddah (road transfer) or starts the trip (arriving through Jeddah).
  const tripCities = useMemo(() => {
    if (!umrah || !cities.length) return cities;
    const jed = cities.indexOf("JED");
    const out = [...cities];
    out.splice(jed >= 0 ? jed + 1 : 0, 0, UMRAH_CITY);
    return out;
  }, [cities, umrah]);

  const totalNights = isValidISODate(departureDate) && isValidISODate(returnDate) ? diffDays(departureDate, returnDate) : 0;

  // Re-distribute nights whenever the cities or trip length change (keeping manual edits otherwise).
  useEffect(() => {
    setStays((cur) => {
      const same = cur.length === tripCities.length && cur.every((s, i) => s.city === tripCities[i]) && cur.reduce((a, s) => a + s.nights, 0) === totalNights;
      return same ? cur : splitNights(tripCities, Math.max(totalNights, tripCities.length));
    });
  }, [tripCities, totalNights]);

  function setNights(i: number, n: number) {
    setStays((cur) => cur.map((s, idx) => (idx === i ? { ...s, nights: Math.max(1, n) } : s)));
  }

  const criteria: SearchCriteria = useMemo(
    () => ({ origin, stays, departureDate, returnDate, rooms, pax: paxFromRooms(rooms), cabin, nationality, ...(umrah ? { umrah: true } : {}) }),
    [origin, stays, departureDate, returnDate, rooms, cabin, nationality, umrah],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateCriteria(criteria, today);
    setErrors(errs);
    if (errs.length) return;
    booking.setCriteria(criteria);
    router.push(`/${locale}/package-visa/flights`);
  }

  const err = (k: SearchError) => (errors.includes(k) ? t.search.errors[k] : undefined);
  const staysSum = stays.reduce((a, s) => a + s.nights, 0);

  return (
    <form onSubmit={submit} noValidate>
      <Card className="p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label={t.search.origin} required error={err("origin")} htmlFor="origin">
            <div className="relative">
              <PlaneIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Select id="origin" value={origin} onChange={(e) => setOrigin(e.target.value)} invalid={!!err("origin")} className="ps-9">
                <option value="">{t.search.originPlaceholder}</option>
                {ORIGIN_CITIES.map((c) => (
                  <option key={c.code} value={c.code}>{`${c[locale]} (${c.code}) — ${c[locale === "ar" ? "airportAr" : "airportEn"]}`}</option>
                ))}
              </Select>
            </div>
          </Field>

          <Field label={t.search.nationality} required error={err("nationality")} htmlFor="nationality">
            <CountrySelect id="nationality" value={nationality} onChange={setNationality} placeholder={t.search.nationalityPlaceholder} invalid={!!err("nationality")} />
          </Field>

          <div className="lg:col-span-2">
            <Field label={t.search.destinations} required error={err("cities")} hint={t.search.destinationsHint} htmlFor="destinations">
              <CityMultiSelect id="destinations" value={cities} onChange={setCities} invalid={!!err("cities")} />
            </Field>
            <label htmlFor="umrah" className={cx("mt-3 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5", umrah ? "border-brand-600 bg-brand-50/60" : umrahHint ? "border-gold-500 bg-gold-50" : "border-slate-200 bg-white")} data-testid="search-umrah">
              <input id="umrah" type="checkbox" checked={umrah} onChange={(e) => setUmrah(e.target.checked)} className="mt-1 size-4 accent-brand-700" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold"><KaabaIcon className="size-4 text-brand-700" />{t.umrah.option.label}</span>
                <span className="block text-xs text-slate-500">{t.umrah.option.declare}</span>
                {umrah && <span className="mt-1 block text-xs font-medium text-brand-700">{t.umrah.option.ground}</span>}
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
            <Field label={t.search.departureDate} required error={err("leadTime") ?? err("dates")} htmlFor="dep">
              <Input id="dep" type="date" value={departureDate} min={addDays(today, PACKAGE_LIMITS.minLeadDays)} max={addDays(today, PACKAGE_LIMITS.maxLeadDays)} onChange={(e) => setDeparture(e.target.value)} invalid={!!(err("leadTime") || err("dates"))} />
            </Field>
            <Field label={t.search.returnDate} required error={err("duration")} htmlFor="ret">
              <Input id="ret" type="date" value={returnDate} min={addDays(departureDate, PACKAGE_LIMITS.minPackageDays)} max={addDays(departureDate, PACKAGE_LIMITS.maxPackageDays)} onChange={(e) => setReturn(e.target.value)} invalid={!!err("duration")} />
            </Field>
          </div>

          {stays.length > 1 && (
            <div className="lg:col-span-2">
              <Field label={t.search.nightsPerCity} error={err("nightsMismatch")}>
                <div className="flex flex-wrap items-center gap-2">
                  {stays.map((s, i) => (
                    <div key={s.city} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                      <span className="text-sm font-semibold">{cityName(s.city, locale)}</span>
                      <Input id={`nights-${s.city}`} type="number" min={1} max={21} value={s.nights} onChange={(e) => setNights(i, Number(e.target.value))} className="h-8 w-16 text-center" aria-label={`${t.common.nights} ${s.city}`} />
                      <span className="text-xs text-slate-500">{t.common.nights}</span>
                    </div>
                  ))}
                  <span className={cx("text-sm font-medium", staysSum === totalNights ? "text-brand-700" : "text-red-600")}>
                    {t.search.totalNights}: {staysSum} / {totalNights}
                  </span>
                </div>
              </Field>
            </div>
          )}

          <Field label={t.search.guests.label} required error={err("rooms") ?? err("childAges") ?? err("maxAdults") ?? err("maxMinors") ?? err("infants") ?? err("pax")} htmlFor="guests">
            <GuestsRoomsPicker
              id="guests"
              value={rooms}
              onChange={setRooms}
              invalid={!!(err("rooms") || err("childAges") || err("maxAdults") || err("maxMinors") || err("infants") || err("pax"))}
            />
          </Field>

          <Field label={t.search.cabin} required htmlFor="cabin">
            <Select id="cabin" value={cabin} onChange={(e) => setCabin(e.target.value as CabinClass)}>
              {(["economy", "premium", "business", "first"] as const).map((c) => (
                <option key={c} value={c}>{t.search.cabins[c]}</option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end lg:col-span-2">
            <Button type="submit" size="lg" className="w-full">
              <UsersIcon className="size-5" />
              {t.search.submit}
            </Button>
          </div>
        </div>
        {errors.length > 0 && (
          <Alert tone="error" className="mt-6">
            <ul className="list-inside list-disc space-y-0.5">
              {errors.map((e) => <li key={e}>{t.search.errors[e]}</li>)}
            </ul>
          </Alert>
        )}
      </Card>
    </form>
  );
}
