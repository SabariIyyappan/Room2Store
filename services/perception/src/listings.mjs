/**
 * Published listings and the buyer-facing radius query.
 *
 * Writes through to Engineer B's REST API when ROOM2STORE_API_BASE_URL is set,
 * and always keeps a local copy so the buyer query works before that service is
 * deployed. The local copy is in memory and dies with the process — it is a
 * bridge until the database is live, not a store.
 */

import { DEFAULT_RADIUS_MILES, clampRadius, distanceMiles } from "./geo.mjs";

const published = new Map();

/**
 * A listing is only publishable once it has a location; the buyer filter has
 * nothing to measure from otherwise. Price is deliberately optional — an item
 * is listed before the pricing study returns, and shows as "price pending".
 */
export async function publishListing(item, { fetchImpl = fetch } = {}) {
  if (!item?.location) throw new Error("A listing needs a pickup location before it can be published.");

  const listing = {
    id: item.id ?? crypto.randomUUID(),
    name: item.name,
    condition: item.condition,
    modelNumber: item.modelNumber ?? null,
    photoUrl: item.photoUrl ?? null,
    price: item.measuredPrice ?? null,
    priceStatus: item.measuredPrice == null ? "being_measured" : "measured",
    location: {
      zip: item.location.zip,
      city: item.location.city,
      state: item.location.state,
      latitude: item.location.latitude,
      longitude: item.location.longitude
    },
    publishedAt: new Date().toISOString()
  };

  published.set(listing.id, listing);
  item.id = listing.id;

  const apiBaseUrl = process.env.ROOM2STORE_API_BASE_URL;
  if (apiBaseUrl) {
    try {
      await writeThroughToApi(apiBaseUrl, listing, fetchImpl);
    } catch (error) {
      // The seller has already been told their listing is live, and it is —
      // locally. Losing the durable copy is worth logging, not worth failing.
      console.log(JSON.stringify({ event: "listing.api_write_failed", id: listing.id, error: error.message }));
    }
  }

  return listing;
}

async function writeThroughToApi(apiBaseUrl, listing, fetchImpl) {
  const campaignId = process.env.ROOM2STORE_CAMPAIGN_ID;
  if (!campaignId) throw new Error("ROOM2STORE_CAMPAIGN_ID is not set.");

  const response = await fetchImpl(`${apiBaseUrl.replace(/\/+$/, "")}/campaigns/${campaignId}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      id: listing.id,
      name: listing.name,
      category: "other",
      attributes: { modelNumber: listing.modelNumber },
      condition: listing.condition,
      conditionNotes: "",
      photoUrls: listing.photoUrl ? [listing.photoUrl] : [],
      status: "live",
      pickupZip: listing.location.zip,
      pickupLatitude: listing.location.latitude,
      pickupLongitude: listing.location.longitude
    })
  });

  if (!response.ok) throw new Error(`API write failed with status ${response.status}.`);
}

/**
 * Buyer query. Without an origin every listing is returned; with one, only
 * those inside the radius, nearest first.
 */
export function queryListings({ origin, radiusMiles = DEFAULT_RADIUS_MILES } = {}) {
  const radius = clampRadius(radiusMiles);
  const all = [...published.values()];
  if (!origin) return { radiusMiles: radius, listings: all };

  const withDistance = all
    .map((listing) => ({ ...listing, distanceMiles: Math.round(distanceMiles(origin, listing.location) * 10) / 10 }))
    .filter((listing) => listing.distanceMiles <= radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return { radiusMiles: radius, origin: { zip: origin.zip }, listings: withDistance };
}

/** Attaches a measured price once the pricing study returns. */
export function setMeasuredPrice(listingId, price) {
  const listing = published.get(listingId);
  if (!listing) return null;
  listing.price = price;
  listing.priceStatus = "measured";
  return listing;
}

/** Test seam. */
export function resetListings() {
  published.clear();
}
