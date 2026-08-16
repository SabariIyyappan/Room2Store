/**
 * The routes Engineer B's Workflows DAG already calls.
 *
 * Until these existed, `stage-integrations.ts` fell back to fixtures on every
 * stage, so the pipeline's "price" was a hard-coded $25 from
 * `syntheticEvidence()` with `sampleSize: 0`. These routes are what make the
 * product's central claim — that the price is measured on humans — true inside
 * the pipeline rather than only inside `terac.mjs`.
 */

import { randomUUID } from "node:crypto";
import { priceFromStudy } from "./terac.mjs";
import { listLiveListings } from "./store.mjs";

/**
 * Adapts a demand-curve fit to the frozen `PriceEvidence` contract.
 *
 * The contracts package is frozen, so the translation lives here rather than
 * changing a shape three services already agree on.
 *
 * @param fit output of fitDemandCurve / priceFromStudy
 * @param naivePrice the "before" guess, so the lift is measurable
 */
export function toPriceEvidence(fit, { itemId, studyId, naivePrice = null }) {
  const pricePoints = fit.pricePoints.map((point) => ({
    price: point.price,
    purchaseProbability: point.probability,
    expectedRevenue: point.expectedRevenue
  }));

  // The naive guess's own expected revenue, measured on the same curve. Without
  // it there is nothing honest to compare the measured price against.
  const naivePoint = naivePrice == null
    ? null
    : pricePoints.reduce(
        (closest, point) => (Math.abs(point.price - naivePrice) < Math.abs(closest.price - naivePrice) ? point : closest),
        pricePoints[0]
      );

  return {
    id: randomUUID(),
    itemId,
    studyId,
    sampleSize: fit.sampleSize,
    pricePoints,
    // A share-of-panel curve is exact for the sample rather than a regression,
    // so quality is reported as sample confidence, not a fabricated R².
    curveFitQuality: Math.min(1, fit.sampleSize / 50),
    recommendedPrice: fit.recommendedPrice,
    floorPrice: fit.floorPrice,
    expectedRevenueBefore: naivePoint?.expectedRevenue ?? 0,
    expectedRevenueAfter: fit.expectedRevenue,
    listingDefects: fit.listingDefects ?? [],
    createdAt: new Date().toISOString()
  };
}

/**
 * POST /study — the DAG's pricing stage.
 *
 * Refuses rather than inventing a price when the panel is too small; an
 * unmeasured price defeats the point of measuring.
 */
export async function handleStudyRoute(body) {
  const item = body?.item ?? {};
  const studyId = item.studyId ?? body.studyId ?? process.env.TERAC_DEFAULT_STUDY_ID;
  if (!studyId) return { status: 400, body: { error: "No Terac study id for this item." } };

  const fit = await priceFromStudy(studyId);
  if (!fit.ok) {
    return {
      status: 422,
      body: { error: "Not enough panel answers to price this item.", sampleSize: fit.sampleSize, studyId }
    };
  }

  return {
    status: 200,
    body: toPriceEvidence(fit, { itemId: item.id ?? body.itemId, studyId, naivePrice: item.naivePrice ?? null })
  };
}

/**
 * POST /ingest — the DAG's catalog stage.
 *
 * Items arrive by text rather than from a room video, so this returns what
 * sellers have actually published rather than pretending to extract frames.
 */
export async function handleIngestRoute(body) {
  const listings = await listLiveListings();
  return {
    status: 200,
    body: listings.map((listing) => ({
      id: listing.id,
      campaignId: body?.campaignId ?? null,
      name: listing.name,
      category: listing.category ?? "other",
      condition: listing.condition,
      conditionNotes: "",
      photos: listing.photoUrl ? [listing.photoUrl] : [],
      attributes: { modelNumber: listing.modelNumber, pickupZip: listing.location?.zip },
      naivePrice: listing.price ?? null,
      measuredPrice: listing.priceStatus === "measured" ? listing.price : null,
      floorPrice: listing.floorPrice ?? null,
      status: listing.priceStatus === "measured" ? "priced" : "draft"
    }))
  };
}
