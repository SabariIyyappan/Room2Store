import test from "node:test";
import assert from "node:assert/strict";
import {
  FLOOR_PROBABILITY,
  MIN_SAMPLE_SIZE,
  extractWillingnessToPay,
  fitDemandCurve,
  isVerifiedTeracWebhook,
  priceFromStudy
} from "../src/terac.mjs";
import { createHmac } from "node:crypto";

test("too few answers produce no price at all", () => {
  const result = fitDemandCurve([100, 120, 90]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "insufficient_sample");
  assert.ok(MIN_SAMPLE_SIZE >= 5, "a handful of answers must not pass as measured");
});

test("the recommended price maximises expected revenue", () => {
  // Six respondents. At $100 everyone buys ($100 expected); at $200 half do
  // ($100); at $150 four of six do ($100). The fit must pick the true maximum.
  const result = fitDemandCurve([100, 120, 150, 180, 200, 250]);
  assert.equal(result.ok, true);
  assert.equal(result.sampleSize, 6);

  const best = result.pricePoints.reduce((a, b) => (b.expectedRevenue > a.expectedRevenue ? b : a));
  assert.equal(result.recommendedPrice, Math.round(best.price));
});

test("the floor is a price most of the panel would still pay", () => {
  const result = fitDemandCurve([50, 60, 70, 80, 90, 100, 110, 120]);
  const atFloor = result.pricePoints.find((point) => point.price === result.floorPrice);
  assert.ok(atFloor.probability >= FLOOR_PROBABILITY, `floor ${result.floorPrice} only ${atFloor.probability}`);
});

test("the floor never exceeds the asking price", () => {
  for (const sample of [[10, 20, 30, 40, 50], [100, 100, 100, 100, 100], [5, 500, 20, 35, 60, 80]]) {
    const result = fitDemandCurve(sample);
    assert.ok(result.floorPrice <= result.recommendedPrice, `floor ${result.floorPrice} > price ${result.recommendedPrice}`);
  }
});

test("probability falls as price rises, which is what makes it a demand curve", () => {
  const { pricePoints } = fitDemandCurve([20, 40, 60, 80, 100, 120]);
  const sorted = [...pricePoints].sort((a, b) => a.price - b.price);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].probability <= sorted[i - 1].probability, "probability must not rise with price");
  }
});

test("willingness to pay is read from whichever question asks about price", () => {
  assert.equal(extractWillingnessToPay({
    screening_answers: [
      { key: "q1", question: "What colour is it?", answer: ["blue"] },
      { key: "wtp", question: "Most you would pay?", answer: ["$145"] }
    ]
  }), 145);

  assert.equal(extractWillingnessToPay({
    screening_answers: [{ key: "max_price", question: "Max price", answer: ["62.50"] }]
  }), 62.5);

  assert.equal(extractWillingnessToPay({
    screening_answers: [{ key: "q1", question: "What colour?", answer: ["blue"] }]
  }), null, "a non-price answer must never be read as a price");
});

test("a study with real answers produces a price end to end", async () => {
  process.env.TERAC_API_KEY = "terac_test_key";
  const submissions = [100, 120, 150, 180, 200, 250].map((amount, index) => ({
    id: `sub_${index}`,
    status: "approved",
    screening_answers: [{ key: "wtp", question: "Most you would pay?", answer: [`$${amount}`] }]
  }));

  const result = await priceFromStudy("opp_1", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: submissions, pagination: { has_more: false } }) })
  });

  assert.equal(result.ok, true);
  assert.equal(result.sampleSize, 6);
  assert.ok(result.recommendedPrice > 0);
  assert.equal(result.opportunityId, "opp_1");
});

function signTerac(body, secret, timestamp = String(Math.floor(Date.now() / 1000))) {
  return {
    "x-terac-request-signature": createHmac("sha256", secret).update(`${timestamp}${body}`).digest("base64"),
    "x-terac-request-timestamp": timestamp
  };
}

test("a correctly signed webhook is accepted", async () => {
  const body = JSON.stringify({ event_type: "submission.approved" });
  assert.equal(await isVerifiedTeracWebhook(signTerac(body, "sec"), body, "sec"), true);
});

test("a forged, tampered or unsigned webhook is rejected", async () => {
  const body = JSON.stringify({ event_type: "submission.approved" });
  const headers = signTerac(body, "sec");

  assert.equal(await isVerifiedTeracWebhook(headers, body, "wrong"), false);
  assert.equal(await isVerifiedTeracWebhook(headers, `${body} tampered`, "sec"), false);
  assert.equal(await isVerifiedTeracWebhook({}, body, "sec"), false);
  assert.equal(await isVerifiedTeracWebhook(headers, body, null), false, "no secret must fail closed");
});

test("a replayed webhook outside the window is rejected", async () => {
  const body = JSON.stringify({ event_type: "submission.approved" });
  const old = String(Math.floor(Date.now() / 1000) - 4000);
  assert.equal(await isVerifiedTeracWebhook(signTerac(body, "sec", old), body, "sec"), false);
});
