import type { Campaign, Item } from "@room2store/contracts";
import { buildStorefront } from "./build-storefront.ts";

/**
 * B10 demo helper — renders, publishes, and deploys one campaign's
 * storefront against the live REST API (same live-only convention as
 * `compliance:review`/`sandbox:demo`). Without `GITHUB_TOKEN`/`GITHUB_OWNER`
 * and `RENDER_API_KEY`/`RENDER_OWNER_ID` set, this still runs end to end
 * against the local, network-free fallbacks.
 */
const campaignId = process.argv[2];
if (!campaignId) throw new Error("Usage: pnpm storebuilder:build -- <campaign-id>");

const apiBaseUrl = (process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`Room2Store API ${response.status} GET ${path}`);
  return (await response.json()) as T;
}

const campaign = await getJson<Campaign>(`/campaigns/${encodeURIComponent(campaignId)}`);
const items = await getJson<Item[]>(`/campaigns/${encodeURIComponent(campaignId)}/items`);

const deploy = await buildStorefront(campaign, items);
console.log(`repo: ${deploy.repoUrl}`);
console.log(`store: ${deploy.storeUrl}`);
