import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureCarSeat, fixtureItems } from "@room2store/contracts/fixtures";
import { GateEngine } from "@room2store/orchestrator";
import { buildStage, catalogStage, complyStage, priceStage, sellStage, settleStage, type PipelineDeps } from "../src/stages.ts";
import { MemoryApiClient, setupRoom, stubIntegrations } from "./support.ts";

const campaignId = fixtureCampaign.id;
const [chair, headphones, lamp] = fixtureItems;

async function deps(items = fixtureItems): Promise<{ deps: PipelineDeps; roomId: string; api: MemoryApiClient }> {
  const { roomService, roomId } = await setupRoom();
  const api = new MemoryApiClient();
  api.seedCampaign(fixtureCampaign);
  api.seedItems(items);
  return { deps: { roomService, gateEngine: new GateEngine(roomService), api, integrations: stubIntegrations() }, roomId, api };
}

test("B9 buildStage blocks the whole deploy batch when one item lacks an approve verdict", async () => {
  const { deps: d, roomId, api } = await deps([lamp, fixtureCarSeat]);
  await catalogStage(d, campaignId, roomId, [lamp, fixtureCarSeat]);

  const lampVerdict = await complyStage(d, campaignId, roomId, lamp, fixtureCampaign);
  const carSeatVerdict = await complyStage(d, campaignId, roomId, fixtureCarSeat, fixtureCampaign);
  assert.equal(lampVerdict.decision, "approve");
  assert.equal(carSeatVerdict.decision, "veto");

  const result = await buildStage(d, campaignId, roomId, [lamp, fixtureCarSeat]);
  assert.equal(result.allowed, false);
  assert.match(result.missingPrerequisites?.join(";") ?? "", new RegExp(fixtureCarSeat.id));

  const campaign = await api.getCampaign(campaignId);
  assert.equal(campaign.storeUrl, undefined, "a blocked deploy must not write a store URL");
});

test("B9 priceStage stays blocked on startResearch while a furniture item's reshoot is pending", async () => {
  const { deps: d, roomId, api } = await deps([chair]);
  await catalogStage(d, campaignId, roomId, [chair]); // chair has no dimensions -> furniture specialist sends it back

  const result = await priceStage(d, campaignId, roomId, chair);
  assert.equal(result.research.allowed, false);
  assert.match(result.research.missingPrerequisites?.join(";") ?? "", /reshoot/);
  assert.equal(api.priceEvidence.length, 0, "a blocked startResearch must never post fabricated evidence");
});

test("B9 priceStage clears both gates for an item with no specialist objection", async () => {
  const { deps: d, roomId } = await deps([headphones]);
  await catalogStage(d, campaignId, roomId, [headphones]); // electronics: missing serial only posts a note, doesn't block

  const result = await priceStage(d, campaignId, roomId, headphones);
  assert.equal(result.research.allowed, true);
  assert.equal(result.setPrice.allowed, true);
  assert.equal(result.setPrice.value?.price, 30);

  const persisted = await d.api.getCampaign(campaignId); // sanity: campaign untouched by pricing
  assert.equal(persisted.status, fixtureCampaign.status);
});

test("B9 sellStage resumes the sandbox on inquiry and gates closeSale on a posted floor price", async () => {
  const setup = await setupRoom();
  const api = new MemoryApiClient();
  api.seedCampaign(fixtureCampaign);
  api.seedItems([lamp]);
  const pipelineDeps: PipelineDeps = { roomService: setup.roomService, gateEngine: new GateEngine(setup.roomService), api, integrations: stubIntegrations() };
  await catalogStage(pipelineDeps, campaignId, setup.roomId, [lamp]);
  await setup.sandboxManager.pause(campaignId, "store deployed (test)");

  const tooEarly = await sellStage(pipelineDeps, campaignId, setup.roomId, lamp.id, "buyer_1", 30);
  assert.equal(tooEarly.allowed, false, "closeSale must refuse without a posted floor price");

  const priced = await priceStage(pipelineDeps, campaignId, setup.roomId, lamp);
  assert.equal(priced.setPrice.allowed, true);

  const sold = await sellStage(pipelineDeps, campaignId, setup.roomId, lamp.id, "buyer_1", 30);
  assert.equal(sold.allowed, true);
  assert.equal(sold.value?.itemId, lamp.id);
  assert.equal(api.orders.length, 1);

  const settled = await settleStage(pipelineDeps, campaignId, setup.roomId, sold.value!);
  assert.equal(settled.allowed, true);
  const item = (await api.listItems(campaignId)).find((entry) => entry.id === lamp.id);
  assert.equal(item?.status, "sold");
});
