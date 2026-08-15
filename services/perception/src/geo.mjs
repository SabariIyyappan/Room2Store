/**
 * ZIP code resolution and distance, for the buyer's radius filter.
 *
 * iMessage carries no location, so the seller's ZIP is asked for in chat and
 * resolved to coordinates here. Lookups are cached for the process lifetime:
 * the same handful of ZIPs repeat constantly and the upstream service is free
 * and unauthenticated, so hammering it would be rude and slow.
 */

const ZIP_API_URL = process.env.ZIP_API_URL || "https://api.zippopotam.us/us";
const EARTH_RADIUS_MILES = 3958.8;
const REQUEST_TIMEOUT_MS = 8_000;

const cache = new Map();

/** US ZIP, with or without the +4 suffix. */
export function isZipCode(text) {
  return /^\d{5}(-\d{4})?$/.test(String(text ?? "").trim());
}

export function normalizeZip(text) {
  return String(text ?? "").trim().slice(0, 5);
}

/**
 * Resolves a ZIP to coordinates and a place name.
 * @returns {Promise<{zip: string, latitude: number, longitude: number, city: string, state: string}>}
 */
export async function lookupZip(zip, { fetchImpl = fetch } = {}) {
  const normalized = normalizeZip(zip);
  if (!isZipCode(normalized)) throw new Error(`${zip} is not a five-digit ZIP code.`);
  if (cache.has(normalized)) return cache.get(normalized);

  const response = await fetchImpl(`${ZIP_API_URL}/${normalized}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 404) throw new Error(`ZIP ${normalized} was not found.`);
  if (!response.ok) throw new Error(`ZIP lookup failed with status ${response.status}.`);

  const payload = await response.json();
  const place = payload?.places?.[0];
  if (!place) throw new Error(`ZIP ${normalized} returned no place.`);

  const resolved = {
    zip: normalized,
    latitude: Number(place.latitude),
    longitude: Number(place.longitude),
    city: place["place name"] ?? "",
    state: place["state abbreviation"] ?? ""
  };
  if (!Number.isFinite(resolved.latitude) || !Number.isFinite(resolved.longitude)) {
    throw new Error(`ZIP ${normalized} returned no usable coordinates.`);
  }

  cache.set(normalized, resolved);
  return resolved;
}

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance in miles. Accurate enough for a pickup radius. */
export function distanceMiles(a, b) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const DEFAULT_RADIUS_MILES = 20;
export const MIN_RADIUS_MILES = 10;
export const MAX_RADIUS_MILES = 100;

/** Clamps a requested radius into the range the buyer slider offers. */
export function clampRadius(miles) {
  const requested = Number(miles);
  if (!Number.isFinite(requested)) return DEFAULT_RADIUS_MILES;
  return Math.min(MAX_RADIUS_MILES, Math.max(MIN_RADIUS_MILES, requested));
}

/** Test seam. */
export function resetZipCache() {
  cache.clear();
}
