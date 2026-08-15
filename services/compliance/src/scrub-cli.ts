import type { Item } from "@room2store/contracts";
import { createPiiModelClient } from "./pii-model-client.ts";
import { scrubListing } from "./scrub-outbound.ts";

const campaignId = process.argv[2];
if (!campaignId) throw new Error("Usage: pnpm pii:scrub -- <campaign-id>");

const apiBaseUrl = (process.env.ROOM2STORE_API_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`Room2Store API ${response.status} GET ${path}`);
  return (await response.json()) as T;
}

const items = await getJson<Item[]>(`/campaigns/${encodeURIComponent(campaignId)}/items`);
const client = createPiiModelClient();

for (const item of items) {
  const changes: Partial<Item> = {};
  const allFindings: string[] = [];

  for (const [field, listing] of [["listingV1", item.listingV1] as const, ["listingV2", item.listingV2] as const]) {
    if (!listing) continue;
    const result = await scrubListing(client, listing);
    if (result.findings.length === 0) continue;
    changes[field] = result.listing;
    for (const scrubbedField of result.findings) {
      allFindings.push(`${field}.${scrubbedField.field}: ${scrubbedField.findings.map((finding) => finding.type).join(", ")}`);
    }
  }

  if (Object.keys(changes).length === 0) {
    console.log(`${item.id} → clean, nothing to scrub`);
    continue;
  }

  const persisted = await fetch(`${apiBaseUrl}/items/${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  if (!persisted.ok) throw new Error(`Room2Store API could not persist scrubbed listing for ${item.id} (${persisted.status})`);

  console.log(`${item.id} → SCRUBBED (${allFindings.join("; ")})`);
}
