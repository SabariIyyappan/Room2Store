import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.ts";
import { InMemoryRepository } from "../src/repository.ts";

test("campaign, item, and evidence flow is available to the other engineers", async (t) => {
  const app = createApp(new InMemoryRepository());
  t.after(() => app.close());

  const campaignReply = await app.inject({ method: "POST", url: "/campaigns", payload: { sellerId: "seller_1", slug: "demo" } });
  assert.equal(campaignReply.statusCode, 201);
  const campaign = campaignReply.json();

  const itemReply = await app.inject({
    method: "POST", url: `/campaigns/${campaign.id}/items`,
    payload: { name: "Desk lamp", category: "lighting", attributes: { color: "white" }, condition: "good", conditionNotes: "works", photoUrls: ["https://example.test/lamp.jpg"] },
  });
  assert.equal(itemReply.statusCode, 201);
  const item = itemReply.json();

  const evidenceReply = await app.inject({
    method: "POST", url: `/items/${item.id}/price-evidence`,
    payload: { studyId: "study_1", sampleSize: 50, pricePoints: [{ price: 20, purchaseProbability: 0.6, expectedRevenue: 12 }], curveFitQuality: 0.9, recommendedPrice: 20, floorPrice: 18, expectedRevenueBefore: 8, expectedRevenueAfter: 12, listingDefects: ["needs a photo"] },
  });
  assert.equal(evidenceReply.statusCode, 201);

  const eventsReply = await app.inject({ method: "GET", url: `/campaigns/${campaign.id}/events` });
  assert.equal(eventsReply.statusCode, 200);
  assert.equal(eventsReply.json().length, 2);
});
