import type { Campaign, Item, Verdict } from "@room2store/contracts";
import { createLiveBandRoomService, loadBandIdentities, RestCampaignRoomStore } from "@room2store/orchestrator";
import { reviewItem } from "./review-item.ts";

const campaignId = process.argv[2];
const roomId = process.argv[3];
if (!campaignId || !roomId) throw new Error("Usage: pnpm compliance:review -- <campaign-id> <room-id>");

const apiBaseUrl = (process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`Room2Store API ${response.status} GET ${path}`);
  return (await response.json()) as T;
}

const campaign = await getJson<Campaign>(`/campaigns/${encodeURIComponent(campaignId)}`);
const items = await getJson<Item[]>(`/campaigns/${encodeURIComponent(campaignId)}/items`);

const service = createLiveBandRoomService(loadBandIdentities(), new RestCampaignRoomStore(apiBaseUrl));

for (const item of items) {
  const verdict: Verdict = await reviewItem(service, campaignId, roomId, item, campaign);
  const persisted = await fetch(`${apiBaseUrl}/items/${encodeURIComponent(item.id)}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verdict),
  });
  if (!persisted.ok) throw new Error(`Room2Store API could not persist verdict for ${item.id} (${persisted.status})`);

  const triggered = verdict.rulesTriggered.length > 0 ? ` (${verdict.rulesTriggered.join(", ")})` : "";
  console.log(`${item.id} → ${verdict.decision.toUpperCase()}${triggered}`);
}
