import assert from "node:assert/strict";
import test from "node:test";
import { assertBandMessage, isBandMessage } from "../src/band-protocol.ts";
import { fixtureCampaign, fixtureItems, fixturePriceEvidence } from "../src/fixtures/index.ts";

test("accepts a research evidence message", () => {
  const message = {
    id: "msg_research_001",
    campaignId: fixtureCampaign.id,
    emittedAt: "2026-08-15T09:02:00.000Z",
    emitter: "research",
    name: "research price evidence",
    evidence: fixturePriceEvidence,
  } as const;

  assert.equal(isBandMessage(message), true);
  assert.doesNotThrow(() => assertBandMessage(message));
});

test("rejects an incomplete price-set message", () => {
  const incompleteMessage = {
    id: "msg_price_001",
    campaignId: fixtureCampaign.id,
    emittedAt: "2026-08-15T09:03:00.000Z",
    emitter: "pricing",
    name: "price set",
    itemId: fixtureItems[0].id,
    price: 24,
  };

  assert.equal(isBandMessage(incompleteMessage), false);
  assert.throws(() => assertBandMessage(incompleteMessage));
});
