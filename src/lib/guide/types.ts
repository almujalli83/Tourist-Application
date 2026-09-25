/** Interactive map & guide of destinations and restaurants. */
export const PLACE_CATEGORIES = [
  "landmark", "heritage", "museum", "nature", "beach", "park", "shopping", "entertainment", "mosque", "restaurant", "cafe",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_TAGS = ["family", "kids", "wheelchair", "free", "outdoor", "indoor", "nightlife", "womenSection", "vegetarian", "seafood"] as const;
export type PlaceTag = (typeof PLACE_TAGS)[number];

/** Opening hours: on `days` (0 = Sunday … 6 = Saturday) from `open` to `close` ("HH:MM", may pass midnight). */
export interface OpeningSlot {
  days: number[];
  open: string;
  close: string;
}

export type PlaceSource = "curated" | "osm" | "official";

export interface Place {
  id: string;
  city: string; // Saudi city code (SAUDI_CITIES)
  category: PlaceCategory;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  lat: number;
  lng: number;
  addressAr?: string;
  addressEn?: string;
  hours?: OpeningSlot[];
  /** Always open (e.g. a park or corniche). */
  open24h?: boolean;
  /** 1 (budget) – 4 (fine dining); restaurants and cafés. */
  priceLevel?: number;
  cuisineAr?: string;
  cuisineEn?: string;
  tags: PlaceTag[];
  phone?: string;
  website?: string;
  /** Suggested visit length in minutes. */
  durationMins?: number;
  source: PlaceSource;
  /** Id in the source (OSM "node/123", official id…), used to avoid duplicate imports. */
  sourceRef?: string;
  status: "published" | "draft";
  updatedAt: string;
}
