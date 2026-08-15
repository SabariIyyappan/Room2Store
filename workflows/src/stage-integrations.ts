import type { Campaign, Item, PriceEvidence } from "@room2store/contracts";
import { fixtureCampaign, fixtureItems, fixturePriceEvidence } from "@room2store/contracts/fixtures";
import { buildStorefront as buildStorefrontDirect } from "@room2store/storebuilder";

/**
 * B9: the sockets this DAG hands to Engineer A's perception/pricing services
 * and Engineer C's commerce service — neither exists in this repo yet. Each
 * capability calls the matching `*_SERVICE_URL` when one is configured;
 * until then it falls back to `@room2store/contracts/fixtures` so the
 * pipeline runs (and its gates fire for real) with no other engineer's code
 * merged. This is the same fixture-first duality as B7's
 * `LocalPiiModelClient` and B8's `LocalSandboxManager` — swap in a real
 * service by setting its URL, no DAG code changes.
 *
 * `buildStorefront` is the one exception: B10's `@room2store/storebuilder`
 * is B's own package, so it's called directly — same in-repo precedent as
 * `complyStage` calling B6's `reviewItem` — rather than routed through an
 * HTTP socket that would only exist to talk to code in this same repo.
 */
export interface StageIntegrations {
  /** A's perception service: video → draft items. Falls back to the fixture campaign's items. */
  ingest(campaignId: string): Promise<Array<Partial<Item>>>;
  /** A's Terac pricing loop for one item. Falls back to fixture evidence (real for the chair, naive-price-derived for anything else). */
  priceStudy(item: Item): Promise<PriceEvidence>;
  /** C's Linq outbound to opted-in contacts. No contact list exists yet, so the fallback is an honest no-op. */
  notifyBuyers(campaignId: string, itemIds: string[]): Promise<{ notified: number }>;
  /** B10's store builder — Lovable template → GitHub repo → Render static site. */
  buildStorefront(campaign: Campaign, items: Item[]): Promise<{ storeUrl: string }>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()) as T;
}

/** A naive, honestly-labeled stand-in for A5's naive pricing when a real study/comps lookup isn't wired up yet. */
function syntheticEvidence(item: Item): PriceEvidence {
  const base = item.naivePrice ?? 25;
  return {
    id: `evidence_synthetic_${item.id}`,
    itemId: item.id,
    studyId: "synthetic_no_panel",
    sampleSize: 0,
    pricePoints: [{ price: base, purchaseProbability: 0.5, expectedRevenue: base * 0.5 }],
    curveFitQuality: 0,
    recommendedPrice: base,
    floorPrice: Math.round(base * 0.8),
    expectedRevenueBefore: base * 0.5,
    expectedRevenueAfter: base * 0.5,
    listingDefects: [],
    createdAt: new Date().toISOString(),
  };
}

export class HybridStageIntegrations implements StageIntegrations {
  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async ingest(campaignId: string): Promise<Array<Partial<Item>>> {
    const url = this.env.PERCEPTION_SERVICE_URL;
    if (url) return postJson<Array<Partial<Item>>>(`${url.replace(/\/$/, "")}/ingest`, { campaignId });
    if (campaignId !== fixtureCampaign.id) {
      throw new Error(`PERCEPTION_SERVICE_URL is not configured and ${campaignId} has no fixture items — set PERCEPTION_SERVICE_URL or run against ${fixtureCampaign.id}`);
    }
    return fixtureItems;
  }

  async priceStudy(item: Item): Promise<PriceEvidence> {
    const url = this.env.PRICING_SERVICE_URL;
    if (url) return postJson<PriceEvidence>(`${url.replace(/\/$/, "")}/study`, { item });
    return item.id === fixtureItems[0]?.id ? fixturePriceEvidence : syntheticEvidence(item);
  }

  async notifyBuyers(campaignId: string, itemIds: string[]): Promise<{ notified: number }> {
    const url = this.env.COMMERCE_SERVICE_URL;
    if (url) return postJson<{ notified: number }>(`${url.replace(/\/$/, "")}/notify`, { campaignId, itemIds });
    return { notified: 0 };
  }

  async buildStorefront(campaign: Campaign, items: Item[]): Promise<{ storeUrl: string }> {
    const { storeUrl } = await buildStorefrontDirect(campaign, items);
    return { storeUrl };
  }
}

export function createStageIntegrations(env: NodeJS.ProcessEnv = process.env): StageIntegrations {
  return new HybridStageIntegrations(env);
}
