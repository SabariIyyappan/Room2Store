import { createLiveBandRoomService, createSandboxManager, GateEngine, loadBandIdentities, RestCampaignRoomStore } from "@room2store/orchestrator";
import { RoomStoreApiClient } from "./api-client.ts";
import { createStageIntegrations } from "./stage-integrations.ts";
import { decayCampaignStage } from "./stages.ts";

/**
 * B11 demo helper — runs the real price-decay check against a live Band
 * room and the live REST API (same live-only convention as
 * `pipeline-cli.ts`/`sandbox-cli.ts`/`compliance:review`). In production
 * this same call is what `render-tasks.ts`'s `decayCampaign` task runs when
 * B12's Render `cron_job` service triggers it — this script exists so the
 * decision (and the "notified N watchers" line) can be demoed without
 * waiting on an actual 24h clock or the cron service being deployed.
 */
const campaignId = process.argv[2];
const roomId = process.argv[3];
if (!campaignId || !roomId) throw new Error("Usage: pnpm workflow:decay -- <campaign-id> <room-id>");

const sandboxManager = createSandboxManager();
const roomService = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(), sandboxManager);
const deps = { roomService, gateEngine: new GateEngine(roomService), api: new RoomStoreApiClient(), integrations: createStageIntegrations() };

const results = await decayCampaignStage(deps, campaignId, roomId);
for (const result of results) {
  if (!result.decayed) {
    console.log(`${result.itemId} → no decay (${result.reason})`);
    continue;
  }
  console.log(`${result.itemId} → decayed to $${result.price} (${result.reason}); notified ${result.notified ?? 0} watchers`);
}
if (results.length === 0) console.log("no live items in this campaign — nothing to check for decay.");
