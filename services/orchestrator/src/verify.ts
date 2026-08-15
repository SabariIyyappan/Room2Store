import { createLiveBandRoomService, RestCampaignRoomStore } from "./room-service.ts";
import { loadBandIdentities } from "./roles.ts";

const service = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore());
const identities = await service.verifyIdentities();

for (const [role, identity] of Object.entries(identities)) console.log(`${role}: ${identity.name} (${identity.handle})`);
