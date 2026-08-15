import assert from "node:assert/strict";
import test from "node:test";
import { fixtureCampaign, fixtureItems } from "@room2store/contracts/fixtures";
import { GateEngine } from "@room2store/orchestrator";
import { runCampaignPipeline } from "../src/pipeline.ts";
import type { PipelineDeps } from "../src/stages.ts";
import { MemoryApiClient, setupRoom, stubIntegrations } from "./support.ts";

const campaignId = fixtureCampaign.id;
const [chair, headphones, lamp] = fixtureItems; // chair has no captured dimensions -> B5 sends it back for a reshoot

test("B9 runs ingest through market, deploying every item that clears both comply and price and excluding the one still stuck on a reshoot", async () => {
  const { roomService, roomId, sandboxManager } = await setupRoom();
  const api = new MemoryApiClient();
  api.seedCampaign(fixtureCampaign);
  api.seedItems([chair, headphones, lamp]);
  const deps: PipelineDeps = {
    roomService,
    gateEngine: new GateEngine(roomService),
    api,
    integrations: stubIntegrations({ notifyBuyers: async () => ({ notified: 5 }) }),
  };

  const result = await runCampaignPipeline(deps, campaignId, roomId);

  assert.equal(result.items.length, 3);
  const byId = Object.fromEntries(result.items.map((entry) => [entry.item.id, entry]));

  assert.equal(byId[chair.id]?.verdict.decision, "approve");
  assert.equal(byId[chair.id]?.price?.setPrice.allowed, false, "the chair's reshoot must keep it out of setPrice");
  assert.equal(byId[headphones.id]?.price?.setPrice.allowed, true);
  assert.equal(byId[lamp.id]?.price?.setPrice.allowed, true);

  assert.equal(result.build?.allowed, true);
  assert.equal(result.build?.value?.storeUrl, `https://room2store-demo.test/${campaignId}`);

  const deployedCampaign = await api.getCampaign(campaignId);
  assert.equal(deployedCampaign.storeUrl, result.build?.value?.storeUrl);
  assert.equal(deployedCampaign.status, "live");

  const chairAfter = (await api.listItems(campaignId)).find((item) => item.id === chair.id);
  assert.notEqual(chairAfter?.status, "live", "an item that never reached setPrice must not go live");
  const lampAfter = (await api.listItems(campaignId)).find((item) => item.id === lamp.id);
  assert.equal(lampAfter?.status, "live");

  assert.deepEqual(result.marketed, { notified: 5 });

  // B8: "store deployed" must have paused the campaign's sandbox for real —
  // resuming it now should report a genuine pause->resume transition, not
  // "sandbox was already active".
  const resumeCheck = await sandboxManager.resume(campaignId, "post-deploy check");
  assert.doesNotMatch(resumeCheck.reason, /already active/);
});

test("B9 skips build and market when no item reaches an approved, priced state", async () => {
  const { roomService, roomId } = await setupRoom();
  const api = new MemoryApiClient();
  api.seedCampaign(fixtureCampaign);
  api.seedItems([chair]); // reshoot-blocked, never reaches setPrice
  const deps: PipelineDeps = { roomService, gateEngine: new GateEngine(roomService), api, integrations: stubIntegrations() };

  const result = await runCampaignPipeline(deps, campaignId, roomId);

  assert.equal(result.build, undefined);
  assert.equal(result.marketed, undefined);
});
