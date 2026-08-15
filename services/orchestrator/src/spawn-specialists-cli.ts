import type { Item } from "@room2store/contracts";
import { createLiveBandRoomService, RestCampaignRoomStore } from "./room-service.ts";
import { loadBandIdentities } from "./roles.ts";
import { spawnSpecialistsForCatalog } from "./spawn-specialists.ts";

const campaignId = process.argv[2];
const roomId = process.argv[3];
if (!campaignId || !roomId) throw new Error("Usage: pnpm specialists:spawn -- <campaign-id> <room-id>");

const apiBaseUrl = (process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const response = await fetch(`${apiBaseUrl}/campaigns/${encodeURIComponent(campaignId)}/items`);
if (!response.ok) throw new Error(`Room2Store API could not list items for ${campaignId} (${response.status})`);
const items = (await response.json()) as Item[];

const service = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(apiBaseUrl));
const outcomes = await spawnSpecialistsForCatalog(service, campaignId, roomId, items);

for (const outcome of outcomes) {
  console.log(`${outcome.role} → ${outcome.itemId}${outcome.signaled ? " [SIGNALED]" : ""}: ${outcome.reason}`);
}
if (outcomes.length === 0) console.log("No item categories matched a specialist.");
