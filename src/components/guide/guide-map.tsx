"use client";

import "leaflet/dist/leaflet.css";
import type * as L from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { PlaceCategory } from "@/lib/guide/types";

/** Marker colour per category (also used by the category chips). */
export type GuideCategory = PlaceCategory | "event" | "station";

export const CATEGORY_COLORS: Record<GuideCategory, string> = {
  event: "#be185d",
  station: "#334155",
  landmark: "#0f766e",
  heritage: "#b45309",
  museum: "#7c3aed",
  nature: "#15803d",
  beach: "#0284c7",
  park: "#65a30d",
  shopping: "#db2777",
  entertainment: "#e11d48",
  mosque: "#047857",
  restaurant: "#ea580c",
  cafe: "#92400e",
};

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  category: GuideCategory;
  label: string;
  /** Short text shown on the pin (e.g. the order of a visit in a day plan). */
  badge?: string;
}

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

const pin = (color: string, selected: boolean, badge?: string) =>
  `<span style="position:relative;display:block;width:${selected ? 30 : 22}px;height:${selected ? 30 : 22}px"><span style="position:absolute;inset:0;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>${
    badge ? `<span style="position:absolute;inset:0;display:grid;place-items:center;color:#fff;font:700 11px/1 system-ui,sans-serif">${badge.replace(/[^\w]/g, "").slice(0, 3)}</span>` : ""
  }</span>`;

/**
 * Interactive map (Leaflet, online tiles). Loads Leaflet in the browser only.
 * `fitKey` changes when the set of points should be refitted (new city, new filter).
 * `className` must position the map box (e.g. "absolute inset-0" or "relative h-64").
 */
export function GuideMap({ points, selectedId, onSelect, center, fitKey, userLocation, onMapClick, className, unavailableText, route }: {
  points: MapPoint[];
  /** Dashed line through these points, in order (a day's route). */
  route?: { lat: number; lng: number }[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  center: { lat: number; lng: number; zoom: number };
  fitKey?: string;
  userLocation?: { lat: number; lng: number } | null;
  onMapClick?: (ll: { lat: number; lng: number }) => void;
  className?: string;
  unavailableText: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const lib = useRef<typeof L | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const userMarker = useRef<L.CircleMarker | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const handlers = useRef({ onSelect, onMapClick });
  handlers.current = { onSelect, onMapClick };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        if (cancelled || !el.current || map.current) return;
        const Lf = (mod.default ?? mod) as typeof L;
        lib.current = Lf;
        const m = Lf.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], center.zoom);
        Lf.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
        layer.current = Lf.layerGroup().addTo(m);
        m.on("click", (e: L.LeafletMouseEvent) => handlers.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
        map.current = m;
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map.current?.off();
      map.current?.stop();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Markers.
  useEffect(() => {
    const Lf = lib.current;
    if (!ready || !Lf || !layer.current) return;
    layer.current.clearLayers();
    markers.current.clear();
    if (route && route.length > 1)
      Lf.polyline(route.map((p) => [p.lat, p.lng] as [number, number]), { color: "#0f766e", weight: 3, opacity: 0.8, dashArray: "6 8" }).addTo(layer.current);
    for (const p of points) {
      const selected = p.id === selectedId;
      const size = selected ? 30 : 22;
      const icon = Lf.divIcon({ className: "guide-pin", html: pin(CATEGORY_COLORS[p.category], selected, p.badge), iconSize: [size, size], iconAnchor: [size / 2, size] });
      const mk = Lf.marker([p.lat, p.lng], { icon, title: p.label, alt: p.label, keyboard: true, zIndexOffset: selected ? 1000 : 0 });
      mk.bindTooltip(p.label, { direction: "top", offset: [0, -size] });
      mk.on("click", () => handlers.current.onSelect?.(p.id));
      mk.addTo(layer.current);
      markers.current.set(p.id, mk);
    }
  }, [ready, points, selectedId, route]);

  // Fit to the points (or the city centre) when the result set changes.
  useEffect(() => {
    const m = map.current;
    const Lf = lib.current;
    if (!ready || !m || !Lf) return;
    m.invalidateSize(); // the container may have just become visible (phones switch list / map)
    if (points.length > 1) m.fitBounds(Lf.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 14, animate: false });
    else if (points.length === 1) m.setView([points[0].lat, points[0].lng], 14, { animate: false });
    else m.setView([center.lat, center.lng], center.zoom, { animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey]);

  // Pan to the selected place.
  useEffect(() => {
    const m = map.current;
    const mk = selectedId ? markers.current.get(selectedId) : null;
    if (m && mk) m.panTo(mk.getLatLng(), { animate: true });
  }, [ready, selectedId]);

  // The traveller's location.
  useEffect(() => {
    const m = map.current;
    const Lf = lib.current;
    if (!ready || !m || !Lf) return;
    userMarker.current?.remove();
    userMarker.current = userLocation
      ? Lf.circleMarker([userLocation.lat, userLocation.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(m)
      : null;
  }, [ready, userLocation]);

  // Leaflet needs to know when its container is resized (e.g. switching list / map on phones).
  useEffect(() => {
    if (!ready || !el.current) return;
    const ro = new ResizeObserver(() => map.current?.invalidateSize({ animate: false }));
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [ready]);

  return (
    <div dir="ltr" className={`isolate ${className ?? ""}`}>
      <div ref={el} className="absolute inset-0 z-0" data-testid="guide-map" />
      {failed && <div className="absolute inset-0 grid place-items-center bg-slate-100 p-6 text-center text-sm text-slate-600">{unavailableText}</div>}
    </div>
  );
}
