import test from "node:test";
import assert from "node:assert/strict";
import { handleIngestRoute, handleStudyRoute, toPriceEvidence } from "../src/dag-routes.mjs";
import { fitDemandCurve } from "../src/terac.mjs";
import { publishListing } from "../src/listings.mjs";
import { resetStore } from "../src/store.mjs";

const SF = { zip: "94107", city: "San Francisco", state: "CA", latitude: 37.7749, longitude: -122.4194 };

test.beforeEach(() => resetStore());

test("a measured fit becomes a contract-shaped PriceEvidence", () => {
  const fit = fitDemandCurve([100, 120, 150, 180, 200, 250]);
  const evidence = toPriceEvidence(fit, { itemId: "item-1", studyId: "opp_1", naivePrice: 250 });

  for (const key of ["id", "itemId", "studyId", "sampleSize", "pricePoints", "curveFitQuality",
                     "recommendedPrice", "floorPrice", "expectedRevenueBefore", "expectedRevenueAfter",
                     "listingDefects", "createdAt"]) {
    assert.ok(key in evidence, `PriceEvidence is missing ${key}`);
  }

  // The DAG reads purchaseProbability, not the fitter's internal `probability`.
  assert.ok("purchaseProbability" in evidence.pricePoints[0]);
  assert.equal(evidence.sampleSize, 6);
  assert.equal(evidence.recommendedPrice, fit.recommendedPrice);
});

test("the measured price beats the naive guess on expected revenue", () => {
  const fit = fitDemandCurve([100, 120, 150, 180, 200, 250]);
  const evidence = toPriceEvidence(fit, { itemId: "i", studyId: "s", naivePrice: 250 });
  assert.ok(
    evidence.expectedRevenueAfter >= evidence.expectedRevenueBefore,
    "a measured price that earns less than the guess would disprove the whole thesis"
  );
});

test("curve quality reflects the sample rather than a fabricated R-squared", () => {
  assert.ok(toPriceEvidence(fitDemandCurve([10, 20, 30, 40, 50]), { itemId: "i", studyId: "s" }).curveFitQuality < 0.2);
  const big = Array.from({ length: 50 }, (_, i) => 10 + i * 5);
  assert.equal(toPriceEvidence(fitDemandCurve(big), { itemId: "i", studyId: "s" }).curveFitQuality, 1);
});

test("/study refuses without a study id rather than guessing", async () => {
  delete process.env.TERAC_DEFAULT_STUDY_ID;
  const result = await handleStudyRoute({ item: { id: "item-1" } });
  assert.equal(result.status, 400);
});

test("/ingest returns the items sellers actually published", async () => {
  await publishListing({ name: "blue chair", condition: "good", sellerChatId: "c1", location: SF });
  const result = await handleIngestRoute({ campaignId: "camp-1" });

  assert.equal(result.status, 200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].name, "blue chair");
  assert.equal(result.body[0].campaignId, "camp-1");
  assert.equal(result.body[0].status, "draft", "an unpriced item must not claim to be priced");
});
