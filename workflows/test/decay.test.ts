import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureItems, fixturePriceEvidence } from "@room2store/contracts/fixtures";
import type { PriceEvidence } from "@room2store/contracts";
import { GateEngine } from "@room2store/orchestrator";
import { decideDecay, DECAY_UNSOLD_THRESHOLD_MS } from "../src/decay.ts";
import { catalogStage, decayCampaignStage, decayStage, priceStage, type PipelineDeps } from "../src/stages.ts";
import { MemoryApiClient, setupRoom, stubIntegrations } from "./support.ts";

const campaignId = fixtureCampaign.id;
const [chair, , lamp] = fixtureItems;

async function pricedLiveItem() {
  const { roomService, roomId } = await setupRoom();
  const api = new MemoryApiClient();
  api.seedCampaign(fixtureCampaign);
  const item = lamp; // "lighting" category: no specialist spawned, nothing to block setPrice
  api.seedItems([item]);
  let notifiedItemIds: string[] = [];
  const deps: PipelineDeps = {
    roomService,
    gateEngine: new GateEngine(roomService),
    api,
    integrations: stubIntegrations({ notifyBuyers: async (_campaignId, itemIds) => { notifiedItemIds = itemIds; return { notified: itemIds.length }; } }),
  };

  await catalogStage(deps, campaignId, roomId, [item]);
  const priced = await priceStage(deps, campaignId, roomId, item);
  assert.equal(priced.setPrice.allowed, true, "test setup: item must clear both pricing gates");
  const livePriced = await api.patchItem(item.id, { status: "live" });

  return { deps, roomId, api, item: livePriced, getNotifiedItemIds: () => notifiedItemIds };
}

test("B11 decideDecay: stays put under the 24h threshold", () => {
  const item = { ...chair, measuredPrice: 30, floorPrice: 20 };
  const decision = decideDecay(item, DECAY_UNSOLD_THRESHOLD_MS - 1000, undefined);
  assert.equal(decision.shouldDecay, false);
});

test("B11 decideDecay: flat cut when no price-point evidence exists", () => {
  const item = { ...chair, measuredPrice: 30, floorPrice: 20 };
  const decision = decideDecay(item, DECAY_UNSOLD_THRESHOLD_MS + 1000, undefined);
  assert.equal(decision.shouldDecay, true);
  assert.equal(decision.newPrice, 27); // 30 * 0.9
});

test("B11 decideDecay: learned elasticity beats the flat cut when a better studied price point exists", () => {
  const item = { ...chair, measuredPrice: 30, floorPrice: 20 };
  const evidence: PriceEvidence = {
    ...fixturePriceEvidence,
    itemId: item.id,
    pricePoints: [
      { price: 30, purchaseProbability: 0.3, expectedRevenue: 9 },
      { price: 25, purchaseProbability: 0.6, expectedRevenue: 15 }, // strictly better than the flat 27 cut
      { price: 15, purchaseProbability: 0.9, expectedRevenue: 13.5 }, // below floor's reach territory but still < floor is excluded
    ],
  };
  const decision = decideDecay(item, DECAY_UNSOLD_THRESHOLD_MS + 1000, evidence);
  assert.equal(decision.shouldDecay, true);
  assert.equal(decision.newPrice, 25);
  assert.match(decision.reason, /elasticity/);
});

test("B11 decideDecay: never drops below the floor price", () => {
  const item = { ...chair, measuredPrice: 22, floorPrice: 20 };
  const decision = decideDecay(item, DECAY_UNSOLD_THRESHOLD_MS + 1000, undefined);
  assert.equal(decision.shouldDecay, true);
  assert.ok(decision.newPrice >= 20, `decayed price ${decision.newPrice} must not undercut the floor`);
});

test("B11 decideDecay: refuses to decay an item already at its floor", () => {
  const item = { ...chair, measuredPrice: 20, floorPrice: 20 };
  const decision = decideDecay(item, DECAY_UNSOLD_THRESHOLD_MS + 1000, undefined);
  assert.equal(decision.shouldDecay, false);
  assert.match(decision.reason, /floor/);
});

test("B11 decayStage: a live item unsold 24h re-posts price set and notifies watchers", async () => {
  const { deps, roomId, api, item, getNotifiedItemIds } = await pricedLiveItem();
  const futureNow = new Date(Date.now() + DECAY_UNSOLD_THRESHOLD_MS + 60_000);

  const result = await decayStage(deps, campaignId, roomId, item, futureNow);
  assert.equal(result.decayed, true);
  assert.ok(result.price !== undefined && result.price < (item.measuredPrice ?? 0), "decayed price must be lower than the current price");
  assert.deepEqual(getNotifiedItemIds(), [item.id]);

  const persisted = (await api.listItems(campaignId)).find((entry) => entry.id === item.id);
  assert.equal(persisted?.measuredPrice, result.price);

  const history = await deps.roomService.readProtocolHistory(roomId);
  const priceSets = history.filter((message) => message.name === "price set" && message.itemId === item.id);
  assert.equal(priceSets.length, 2, "decay must re-post price set, not silently mutate the DB");
});

test("B11 decayStage: does nothing before 24h have elapsed", async () => {
  const { deps, roomId, item, getNotifiedItemIds } = await pricedLiveItem();

  const result = await decayStage(deps, campaignId, roomId, item, new Date());
  assert.equal(result.decayed, false);
  assert.deepEqual(getNotifiedItemIds(), []);
});

test("B11 decayStage: skips a non-live item (e.g. sold or vetoed)", async () => {
  const { deps, roomId, api, item } = await pricedLiveItem();
  const soldItem = await api.patchItem(item.id, { status: "sold" });
  const futureNow = new Date(Date.now() + DECAY_UNSOLD_THRESHOLD_MS + 60_000);

  const result = await decayStage(deps, campaignId, roomId, soldItem, futureNow);
  assert.equal(result.decayed, false);
  assert.match(result.reason, /status/);
});

test("B11 decayCampaignStage: checks every live item in the campaign and skips non-live ones", async () => {
  const { deps, roomId, api, item } = await pricedLiveItem();
  const draftItem = await api.createItem(campaignId, { name: "unpriced lamp", category: "furniture", status: "draft" });
  const futureNow = new Date(Date.now() + DECAY_UNSOLD_THRESHOLD_MS + 60_000);

  const results = await decayCampaignStage(deps, campaignId, roomId, futureNow);
  assert.equal(results.length, 1, "only the live item should be checked");
  assert.equal(results[0]?.itemId, item.id);
  assert.equal(results[0]?.decayed, true);
  assert.equal((await api.listItems(campaignId)).find((entry) => entry.id === draftItem.id)?.measuredPrice, undefined);
});
