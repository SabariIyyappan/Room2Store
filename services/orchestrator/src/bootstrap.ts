import { createLiveBandRoomService, RestCampaignRoomStore } from "./room-service.ts";
import { loadBandIdentities } from "./roles.ts";

const campaignId = process.argv[2];
if (!campaignId) throw new Error("Usage: pnpm band:bootstrap -- <campaign-id>");

const service = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore());
const room = await service.createCampaignRoom(campaignId);
console.log(`Created Band room ${room.roomId} for campaign ${room.campaignId} with ${room.participants.length} participants.`);
