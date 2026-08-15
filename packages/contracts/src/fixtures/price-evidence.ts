import type { PriceEvidence } from "../entities.ts";
import { fixtureItems, fixtureTimestamp } from "./campaign.ts";

export const fixturePriceEvidence: PriceEvidence = {
  id: "evidence_chair_study_a_001",
  itemId: fixtureItems[0].id,
  studyId: "terac_study_a_001",
  sampleSize: 50,
  pricePoints: [
    { price: 24, purchaseProbability: 0.6, expectedRevenue: 14.4, confidenceInterval: { lower: 0.47, upper: 0.72 } },
    { price: 28, purchaseProbability: 0.52, expectedRevenue: 14.56, confidenceInterval: { lower: 0.39, upper: 0.65 } },
    { price: 32, purchaseProbability: 0.47, expectedRevenue: 15.04, confidenceInterval: { lower: 0.34, upper: 0.61 } },
    { price: 40, purchaseProbability: 0.19, expectedRevenue: 7.6, confidenceInterval: { lower: 0.1, upper: 0.32 } },
  ],
  curveFitQuality: 0.88,
  recommendedPrice: 32,
  floorPrice: 25,
  expectedRevenueBefore: 7.6,
  expectedRevenueAfter: 15.04,
  listingDefects: ["seat height is not stated", "arm-rest wear needs a close-up", "pickup window is unclear"],
  createdAt: fixtureTimestamp,
};
