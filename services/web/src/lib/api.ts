/**
 * Client for the perception service's public listing search.
 *
 * Base URL comes from VITE_API_BASE_URL at build time. Left unset, requests go
 * to a relative /api path, which the dev server proxies — so local development
 * needs no configuration and no CORS.
 */

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export const DEFAULT_RADIUS_MILES = 20;
export const MIN_RADIUS_MILES = 10;
export const MAX_RADIUS_MILES = 100;

/** The Linq number buyers text. Build-time config so it is never hard-coded. */
export const SELLER_PHONE = import.meta.env.VITE_LINQ_PHONE ?? "+12134559546";

export type ListingLocation = {
  zip: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
};

export type Listing = {
  id: string;
  /** Short human-typable code a buyer texts to start a negotiation. */
  code: string;
  name: string;
  condition: string;
  modelNumber: string | null;
  photoUrl: string | null;
  /** null until the pricing study has measured one. Never invent a number here. */
  price: number | null;
  floorPrice?: number | null;
  /** estimated = a model guess; measured = a real panel priced it. */
  priceStatus: "being_measured" | "estimated" | "measured";
  location: ListingLocation;
  publishedAt: string;
  distanceMiles?: number;
};

export type ListingSearchResult = {
  radiusMiles: number;
  origin?: { zip: string };
  listings: Listing[];
};

export async function fetchListings(
  { zip, radiusMiles }: { zip?: string; radiusMiles?: number },
  signal?: AbortSignal
): Promise<ListingSearchResult> {
  const params = new URLSearchParams();
  if (zip) params.set("zip", zip);
  if (radiusMiles != null) params.set("radius", String(radiusMiles));

  const response = await fetch(`${API_BASE_URL}/api/listings?${params}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Listing search failed (${response.status}).`);
  return body as ListingSearchResult;
}
