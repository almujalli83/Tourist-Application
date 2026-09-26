"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { computePackagePrice, type PriceBreakdown } from "@/lib/pricing";
import type { ActivityOffer, FlightLeg, FlightOffer, HotelOffer, SearchCriteria, Traveller } from "@/lib/types";
import { expectedTravellers } from "@/lib/occupancy";
import { emptyTraveller } from "@/lib/visa-validation";

const STORAGE_KEY = "ta_booking_v2";
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
/** Search results are re-fetched after this long (agent offers expire after 45 minutes). */
const RESULTS_MAX_AGE_MS = 30 * 60 * 1000;

interface Persisted {
  build: string;
  savedAt: number;
  state: State;
}

/**
 * Restores the saved booking. Search results and selections are kept only if they were saved
 * by the same app version and are still fresh; otherwise only the trip criteria and the
 * traveller details are restored and the searches run again.
 */
function restore(raw: string | null, now = Date.now()): State | null {
  if (!raw) return null;
  const saved = JSON.parse(raw) as Partial<Persisted>;
  // Searches saved before rooms and children's ages were introduced cannot be restored.
  if (!saved.state || (saved.state.criteria && !Array.isArray(saved.state.criteria.rooms))) return null;
  const s: State = { ...INITIAL, ...saved.state };
  const fresh = saved.build === BUILD_ID && typeof saved.savedAt === "number" && now - saved.savedAt < RESULTS_MAX_AGE_MS;
  if (fresh) return s;
  return { ...INITIAL, criteria: s.criteria, travellers: s.travellers, disclaimerAccepted: s.disclaimerAccepted, tripPlanId: s.tripPlanId };
}

export interface FlightLegResult { leg: FlightLeg; offers: FlightOffer[]; failedAgents: string[] }
export interface StayInfo { city: string; checkIn: string; checkOut: string; nights: number }
export interface HotelStayResult { stay: StayInfo; offers: HotelOffer[]; failedAgents: string[] }
export interface ActivityStayResult { stay: StayInfo; offers: ActivityOffer[] }

interface State {
  criteria: SearchCriteria | null;
  flightResults: FlightLegResult[] | null;
  hotelResults: HotelStayResult[] | null;
  activityResults: ActivityStayResult[] | null;
  flights: Record<number, string>;
  hotels: Record<string, string>;
  activities: string[];
  travellers: Traveller[];
  disclaimerAccepted: boolean;
  /** Optional eSIMs (Tygo) for some travellers — paid with the package, not part of its price. */
  esim: EsimChoice | null;
  /** Trip plan (smart planner) this package is built from; attached to the booking when it matches. */
  tripPlanId: string | null;
}

export interface EsimChoice { planId: string; priceSAR: number; travellers: number[] }

const INITIAL: State = {
  criteria: null, flightResults: null, hotelResults: null, activityResults: null,
  flights: {}, hotels: {}, activities: [], travellers: [], disclaimerAccepted: false, esim: null, tripPlanId: null,
};

interface BookingCtx extends State {
  hydrated: boolean;
  setCriteria: (c: SearchCriteria) => void;
  /** Starts a booking from an approved trip plan (its dates, cities and travellers). */
  startFromPlan: (c: SearchCriteria, planId: string) => void;
  setFlightResults: (r: FlightLegResult[]) => void;
  setHotelResults: (r: HotelStayResult[]) => void;
  setActivityResults: (r: ActivityStayResult[]) => void;
  selectFlight: (legIndex: number, id: string) => void;
  selectHotel: (city: string, id: string) => void;
  toggleActivity: (id: string) => void;
  updateTraveller: (i: number, patch: Partial<Traveller>) => void;
  setDisclaimer: (v: boolean) => void;
  setEsim: (e: EsimChoice | null) => void;
  reset: () => void;
  selectedFlights: FlightOffer[];
  selectedHotels: HotelOffer[];
  selectedActivities: ActivityOffer[];
  price: PriceBreakdown | null;
  /** eSIM amount (0 when none) and the amount charged: package price + eSIMs. */
  esimSAR: number;
  amountToPaySAR: number;
}

const Ctx = createContext<BookingCtx | null>(null);

/** One form per traveller of the search's rooms (adults 18+, then minors by age), keeping matching entries. */
function travellersFor(c: SearchCriteria, prev: Traveller[]): Traveller[] {
  return expectedTravellers(c.rooms).map(({ paxType, declaredAge }, i) => {
    const p = prev[i];
    if (p && p.paxType === paxType && p.declaredAge === declaredAge) return p;
    const t = emptyTraveller(paxType, c.nationality);
    // Teenagers (12–17) fly on adult fares but are minors: give them the minor defaults.
    return declaredAge !== null && paxType === "adult"
      ? { ...emptyTraveller("child", c.nationality), paxType, declaredAge }
      : { ...t, declaredAge };
  });
}

/** Images are kept in memory only (they can be several MB); everything else survives a refresh. */
function persistable(s: State): State {
  return { ...s, travellers: s.travellers.map((t) => ({ ...t, personPhoto: "", passportImage: "" })) };
}

export function BookingProvider({ children, visaFeeSAR }: { children: ReactNode; visaFeeSAR: number }) {
  const [state, setState] = useState<State>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const skipSave = useRef(true);

  useEffect(() => {
    try {
      sessionStorage.removeItem("ta_booking_v1"); // format used by earlier versions
      const restored = restore(sessionStorage.getItem(STORAGE_KEY));
      if (restored) setState(restored);
    } catch {
      /* storage unavailable */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      const saved: Persisted = { build: BUILD_ID, savedAt: Date.now(), state: persistable(state) };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* quota or private mode */
    }
  }, [state, hydrated]);

  const setCriteria = useCallback((c: SearchCriteria) => {
    setState((s) => ({
      ...INITIAL,
      criteria: c,
      travellers: travellersFor(c, s.travellers),
      // The plan stays linked; the server attaches it only if the booking still matches it.
      tripPlanId: s.tripPlanId,
    }));
  }, []);

  const startFromPlan = useCallback((c: SearchCriteria, planId: string) => {
    setState((s) => ({ ...INITIAL, criteria: c, travellers: travellersFor(c, s.travellers), tripPlanId: planId }));
  }, []);

  const api = useMemo(() => ({
    setFlightResults: (r: FlightLegResult[]) => setState((s) => ({ ...s, flightResults: r, flights: {} })),
    setHotelResults: (r: HotelStayResult[]) => setState((s) => ({ ...s, hotelResults: r, hotels: {} })),
    setActivityResults: (r: ActivityStayResult[]) => setState((s) => ({ ...s, activityResults: r, activities: [] })),
    selectFlight: (legIndex: number, id: string) => setState((s) => ({ ...s, flights: { ...s.flights, [legIndex]: id } })),
    selectHotel: (city: string, id: string) => setState((s) => ({ ...s, hotels: { ...s.hotels, [city]: id } })),
    toggleActivity: (id: string) =>
      setState((s) => ({ ...s, activities: s.activities.includes(id) ? s.activities.filter((x) => x !== id) : [...s.activities, id] })),
    updateTraveller: (i: number, patch: Partial<Traveller>) =>
      setState((s) => ({ ...s, travellers: s.travellers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) })),
    setDisclaimer: (v: boolean) => setState((s) => ({ ...s, disclaimerAccepted: v })),
    setEsim: (e: EsimChoice | null) => setState((s) => ({ ...s, esim: e && e.travellers.length ? e : null })),
    reset: () => {
      setState(INITIAL);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    },
  }), []);

  const derived = useMemo(() => {
    const selectedFlights = (state.flightResults ?? [])
      .map((r) => r.offers.find((o) => o.id === state.flights[r.leg.index]))
      .filter((x): x is FlightOffer => !!x);
    const selectedHotels = (state.hotelResults ?? [])
      .map((r) => r.offers.find((o) => o.id === state.hotels[r.stay.city]))
      .filter((x): x is HotelOffer => !!x);
    const allActivities = (state.activityResults ?? []).flatMap((r) => r.offers);
    const selectedActivities = state.activities.map((id) => allActivities.find((a) => a.id === id)).filter((x): x is ActivityOffer => !!x);
    const price = state.criteria
      ? computePackagePrice({ pax: state.criteria.pax, flights: selectedFlights, hotels: selectedHotels, activities: selectedActivities, visaFeeSAR })
      : null;
    const esimSAR = state.esim ? Math.round(state.esim.priceSAR * state.esim.travellers.length * 100) / 100 : 0;
    const amountToPaySAR = price ? Math.round((price.totalSAR + esimSAR) * 100) / 100 : 0;
    return { selectedFlights, selectedHotels, selectedActivities, price, esimSAR, amountToPaySAR };
  }, [state, visaFeeSAR]);

  const value = useMemo(() => ({ ...state, ...api, ...derived, hydrated, setCriteria, startFromPlan }), [state, api, derived, hydrated, setCriteria, startFromPlan]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Clears the finished booking from the wizard once its confirmation is shown. */
export function ResetBookingOnMount() {
  const { reset, hydrated } = useBooking();
  useEffect(() => {
    if (hydrated) reset();
  }, [hydrated, reset]);
  return null;
}

export function useBooking() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBooking must be used within BookingProvider");
  return v;
}
