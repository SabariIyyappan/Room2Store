import { createLiveBandRoomService, RestCampaignRoomStore } from "./room-service.ts";
import { loadBandIdentities } from "./roles.ts";
import { createSandboxManager } from "./sandbox-manager.ts";

const campaignId = process.argv[2];
if (!campaignId) throw new Error("Usage: pnpm band:bootstrap -- <campaign-id>");

const sandboxManager = createSandboxManager();
const service = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(), sandboxManager);
const room = await service.createCampaignRoom(campaignId);
console.log(`Created Band room ${room.roomId} for campaign ${room.campaignId} with ${room.participants.length} participants.`);

// B8: one Superserve sandbox per campaign, provisioned at bootstrap so it's
// ready before catalog/pricing work starts using it.
const provisioned = await sandboxManager.provision(campaignId);
console.log(`Superserve sandbox ${provisioned.sandboxId} ${provisioned.action} for campaign ${campaignId} (${provisioned.reason}).`);
