/**
 * Published listings and the buyer-facing radius query.
 *
 * Everything goes through the store, so a listing survives a redeploy when
 * DATABASE_URL is set and lives in memory when it is not. Distance filtering is
 * done here rather than in SQL: the listing count is small and the maths is
 * identical on both backends.
 */

import { DEFAULT_RADIUS_MILES, clampRadius, distanceMiles } from "./geo.mjs";
import {
  findListingById,
  generateListingCode,
  insertListing,
  listLiveListings,
  updateListing,
  upsertSeller
} from "./store.mjs";

/**
 * A listing is only publishable once it has a location; the buyer filter has
 * nothing to measure from otherwise. Price is deliberately optional — an item
 * is listed before the pricing study returns, and shows as "price pending".
 */
export async function publishListing(item) {
  if (!item?.location) throw new Error("A listing needs a pickup location before it can be published.");

  const seller = await upsertSeller({ chatId: item.sellerChatId ?? "unknown", phone: item.sellerPhone });
  const listing = {
    id: item.id ?? crypto.randomUUID(),
    code: item.code ?? generateListingCode(),
    sellerId: seller.id,
    sellerChatId: item.sellerChatId ?? null,
    name: item.name,
    category: item.category ?? "other",
    modelNumber: item.modelNumber && item.modelNumber !== "MODEL_UNKNOWN" ? item.modelNumber : null,
    condition: item.condition,
    photoUrl: item.photoUrl ?? null,
    price: item.measuredPrice ?? null,
    floorPrice: item.floorPrice ?? null,
    priceStatus: item.measuredPrice == null ? "being_measured" : "measured",
    status: "live",
    location: { ...item.location },
    publishedAt: new Date().toISOString()
  };

  await insertListing(listing);
  item.id = listing.id;
  item.code = listing.code;
  return listing;
}

/**
 * Buyer query. Without an origin every live listing is returned; with one, only
 * those inside the radius, nearest first.
 */
export async function queryListings({ origin, radiusMiles = DEFAULT_RADIUS_MILES } = {}) {
  const radius = clampRadius(radiusMiles);
  const all = await listLiveListings();
  if (!origin) return { radiusMiles: radius, listings: all };

  const withDistance = all
    .map((listing) => ({ ...listing, distanceMiles: Math.round(distanceMiles(origin, listing.location) * 10) / 10 }))
    .filter((listing) => listing.distanceMiles <= radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return { radiusMiles: radius, origin: { zip: origin.zip }, listings: withDistance };
}

/** Attaches a measured price once the pricing study returns. */
export async function setMeasuredPrice(listingId, price, { floorPrice = null, studyId = null } = {}) {
  const existing = await findListingById(listingId);
  if (!existing) return null;

  return updateListing(listingId, {
    price,
    // No explicit floor means the seller will not go below the measured price.
    floorPrice: floorPrice ?? price,
    studyId,
    priceStatus: "measured"
  });
}

export { findListingById as getListing };
