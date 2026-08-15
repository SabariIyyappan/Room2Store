import { createLiveBandRoomService, createSandboxManager, GateEngine, loadBandIdentities, RestCampaignRoomStore } from "@room2store/orchestrator";
import { RoomStoreApiClient } from "./api-client.ts";
import { runCampaignPipeline } from "./pipeline.ts";
import { createStageIntegrations } from "./stage-integrations.ts";

/**
 * B9 demo helper — runs the real ingest→catalog→price→comply→build→market
 * DAG end to end against a live Band room and the live REST API (same
 * live-only convention as `band:bootstrap`/`compliance:review`/
 * `sandbox:demo`). This is what proves B9 is the actual pipeline: watch
 * "store deployed" post for real and B8's sandbox pause fire off the back
 * of it, with no separate wiring.
 */
const campaignId = process.argv[2];
const roomId = process.argv[3];
if (!campaignId || !roomId) throw new Error("Usage: pnpm workflow:demo -- <campaign-id> <room-id>");

const sandboxManager = createSandboxManager();
const roomService = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(), sandboxManager);
const deps = { roomService, gateEngine: new GateEngine(roomService), api: new RoomStoreApiClient(), integrations: createStageIntegrations() };

const result = await runCampaignPipeline(deps, campaignId, roomId);

for (const { item, price, verdict } of result.items) {
  if (verdict.decision !== "approve") {
    console.log(`${item.id} → ${verdict.decision.toUpperCase()} (${verdict.reason}) — never sent to pricing`);
    continue;
  }
  const priced = price?.setPrice.allowed
    ? `priced at $${price.setPrice.value?.price} (floor $${price.setPrice.value?.floor})`
    : `blocked: ${(price?.setPrice.missingPrerequisites ?? price?.research.missingPrerequisites)?.join("; ")}`;
  console.log(`${item.id} → APPROVE → ${priced}`);
}

if (result.build) {
  console.log(result.build.allowed ? `store deployed → ${result.build.value?.storeUrl}` : `deploy blocked: ${result.build.missingPrerequisites?.join("; ")}`);
}
if (result.marketed) console.log(`market: notified ${result.marketed.notified} opted-in contacts`);
if (!result.build) console.log("no items reached an approved verdict — nothing to deploy or market.");
